# atlas-query-stream vs cheerio

I initially tried the queries below with a 40MB file, but cheerio's memory usage caused node.js to crash due to a heap allocation failure. Here we'll be making a 25MB file instead.

## preface

One way to scrape HTML is to parse it, build a DOM, then provide useful inspection utils for the caller. This is what cheerio does. This requires you read the html and construct a DOM before the caller can do anything -- not good when scanning large files.

This library solves that problem by doing the parsing and scraping in parallel, without using a physical DOM. Since this library doesn't construct a DOM, it makes no sense to talk about DOM manipulation and rendering<sup>1</sup>. Its primary goal is to aid in high-performance web scraping. In this article, we'll discuss how atlas-query-stream compares to cheerio when it comes to scraping data from html.

<sup>1</sup> <sub>One could easily write a plugin for this package which creates a DOM and renders html, but that is outside the scope of this article. I recommend using JSX components for rendering html.</sub>

## writing basic performance tests

You can [skip to the results](#results) if you want. To better see how this works, we'll compare atlas-query-stream to cheerio when querying a 25MB html file:

### 1. generate an html file to test with

We'll be using the following template (`template.html`):

```html
<!DOCTYPE html>
<html>
  <head>
    <title>My App</title>
  </head>
  <body>
    <!-- This is our navbar -->
    <ul>
      <li style="color: blue;">Home</li>
      <li><a href="./about.html">About</a></li>
      <li>Posts</li>
    </ul>
    <!-- These are our random matrices -->
    {matrices}
  </body>
</html>
```

Next, we need to generate html to insert into the `{matrices}` placeholder, then write the file to `large.html`:

```javascript
const { readFileSync, writeFileSync } = require("fs")

// an li vector with the right indentation
const makeVector = len => {
  const vector = Array(len).fill(), delim = "\n              ";
  return vector.map(e => `<li>${Math.random()}</li>`).join(delim);
}

// make random matrices with some fluff content
const makeMatrices = (numberOfMatrices, vectorLen) => {
  let body = ""
  for (let i = 0; i < numberOfMatrices; i++){
    body += `
      <p>
        <ol>
          <li>Random ${vectorLen}x2 Matrix</li>
          <li>
            <ol>
              ${makeVector(vectorLen)}
            </ol>
          </li>
          <li>
            <ol>
              ${makeVector(vectorLen)}
            </ol>
          </li>
        </ol>
        <ol>
          <li>Another OL</li>
        </ol>
      </p>
    `
  }  
  return body;
}

// insert the generated html into our template, write output to large.html
const fillTemplate = matrices => {
  let template = readFileSync("./template.html").toString();
  template = template.replace("{matrices}", matrices);
  writeFileSync("./large.html", template);
}

// creates a ~25MB html file with 50,000 random 3x2 matrices.
fillTemplate(makeMatrices(50000, 3))
```

### 2. write queries to test

Now we have a huge file which we can parse and query. Let's write a cheerio query and an atlas-query-stream query which find the i<sup>th</sup> 3x2 matrix in the file, and outputs the matrix in numerical form:

```javascript
// tell cheerio to find the i-th 3x2 matrix:
const cheerioQuery = ($, i) => {
  let matrix = []
  const p = $("p").eq(i*2);
  if (!p[0]) return matrix
  $("ol", p[0].next).each(function(j){
    matrix[j] = [];
    $("li", this).each(function(){
      matrix[j].push(Number($(this).text()))
    })
  })
  return matrix;
}

// tell atlas-query-stream to find the nm-th el
// in the i-th 3x2 matrix for all n, m:
const atlasQuery = i => {
  let cur = 0, row = -1;
  return ({name}) => {
    if (name !== "p" || cur++ !== i) return;
    return ({name}) => {
      if (name !== "ol") return;
      return [({name}) => {
        if (name !== "ol") return;
        row++;
        return [({name}) => {
          if (name !== "li") return;
          return ({text}) => ({row, el: Number(text)})
        }]
      }]
    }
  }
}
``` 

### 3. run the tests

Now that we know what we're querying, we can run the tests. We'll need to use the garbage collector manually to make sure we reset the heap after we run each test:

```javascript
...
const { createReadStream, readFileSync } = require("fs");
const cheerio = require("cheerio");
const QueryStream = require("atlas-query-stream");
const HtmlParser = require("atlas-html-stream")
const clock = require("atlas-hrtime");
const pretty = require("atlas-pretty-hrtime");

const prettyMem = (dec=3) => (process.memoryUsage().heapUsed/1e6).toFixed(dec)+"MB"

const cheerioTest = () => {
  const t0 = clock();
  const $ = cheerio.load(readFileSync("./large.html"))
  console.log("cheerio result:", cheerioQuery($, 49999))  
  console.log("cheerio time:", pretty(clock(t0)))
  console.log("cheerio memo:", prettyMem())
}

const atlasTest = () => {
  const t0 = clock(), matrix = [];
  createReadStream("./large.html")
    .pipe(new HtmlParser)
    .pipe(new QueryStream(atlasQuery(49999)))
    .on("data", ({row, el}) => {
      (matrix[row] = matrix[row] || []).push(el)
    })
    .on("end", () => {
      console.log("atlas result:", matrix)
      console.log("atlas time:", pretty(clock(t0)))
      console.log("atlas memo:", prettyMem())
    })
}

global.gc()
cheerioTest()
global.gc()
atlasTest()
```

## results

To reiterate, our testing file was a 25MB html file with 50,000 3x2 random matrices (formed with `ul`s).

#### finding the 0<sup>th</sup> 3x2 matrix

```
cheerio result: [ [ 0.00650557031430643, 0.33783918721031925, 0.6876082877144332 ],
  [ 0.5736308399741228, 0.8820399050390779, 0.9971913477265655 ] ]
cheerio time: 4.736min
cheerio memo: 1139.529MB
atlas result: [ [ 0.00650557031430643, 0.33783918721031925, 0.6876082877144332 ],
  [ 0.5736308399741228, 0.8820399050390779, 0.9971913477265655 ] ]
atlas time: 37.064ms
atlas memo: 9.265MB
```

Querying the beginning of the file is an edge case, but it should be noted that this library does not read any more of the file than it needs to in order to fully complete its queries. In this rare case, atlas-query-stream library outspeeds cheerio by four orders of magnitude, and uses over 100x less memory.

#### finding the 49,999<sup>th</sup> 3x2 matrix

```
cheerio result: [ [ 0.46405740653561955, 0.2838379946539591, 0.8492857246461349 ],
  [ 0.5856133729014614, 0.6709200373930164, 0.8925910958912295 ] ]
cheerio time: 4.775min
cheerio memo: 1258.191MB
atlas result: [ [ 0.46405740653561955, 0.2838379946539591, 0.8492857246461349 ],
  [ 0.5856133729014614, 0.6709200373930164, 0.8925910958912295 ] ]
atlas time: 2.113sec
atlas memo: 10.807MB
```

Even when the information is at the end of the file, this library uses over 100x less memory and gets the desired information over 100x faster than cheerio.

#### not running any queries

```
// cheerio
cheerio time: 7.089sec
cheerio memo: 1025.871MB
// atlas-query-stream
Error: requires at least one query
// atlas-html-parser (2x faster than htmlparser2)
atlas time: 697.742ms
atlas memo: 8.502MB
```

This library does not make sense without queries, so there is no analogous test here. Cheerio aims to produce a complete in-memory tree, regardless of whether or not it is used. In this case, the parsing (which may be considered "inital setup") still outspeeds cheerio's setup by an order of magnitude, still using 100x less memory.

## discussion

If we were doing these tests right, we'd use a larger sample size and calculate the mean and standard deviation of the results, but my main purpose here is to illustrate how atlas-query-stream works:

  1. Uses around 10MB of memory, regardless of file size.
  2. Only executes queries while the stack is non-empty, otherwise it unpipes.
  3. Wastes no time creating a DOM.
  4. Allows you to query the html as if there were a DOM.

Scanning the entire file still outspeeds cheerio even when cheerio does not make any queries. The initial setup time and computing resources that cheerio requires is a game-breaker for large scale webscraping. Cheerio is best suited for things like email template manipulation, and other smaller tasks.
