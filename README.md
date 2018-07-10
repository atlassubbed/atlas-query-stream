# atlas-query-stream

A query engine for atlas-html-stream which captures information from an html stream without using a DOM.

[![Travis](https://img.shields.io/travis/atlassubbed/atlas-query-stream.svg)](https://travis-ci.org/atlassubbed/atlas-query-stream)

---

## install

```
npm install --save atlas-query-stream
```

## why

I found cheerio's API to be large and counter-intuitive, forcing me to look up syntax for a plethora of functions and types. Using a DOM-based query engine is a no-go for large documents and html streaming where constructing a DOM is not possible.

I want to be able to query html files intuitively without needing the entire file in memory. This package lets you define recursive crawlers that fetch information from a continuous stream of html nodes. Once you find the information you are looking for, you can end the html stream immediately without reading the rest of the file. You can use [atlas-html-stream](https://github.com/atlassubbed/atlas-html-stream#readme) to obtain a continuous stream of html nodes from a file.

## introduction

#### queries

The queries specified here are basic functions which take an open or text node and return either a truthy result, falsy, or another query. Queries may be wrapped in an array to indicate that they are *recursive*. A *basic* query will only be executed until it finds the first result, whereas a recursive query is executed indefinitely, allowing many results to be found.

#### input

This query runner takes "html nodes" of the following form:

  1. Open tags: `{name: String, data: Object}`
  2. Text node: `{text: String}`
  3. Close tag: `{name: String}`

All text nodes are childless, therefore do not require a closing tag. Self-closing tags are split into an open tag and a close tag. If you use [atlas-html-stream](https://github.com/atlassubbed/atlas-html-stream#readme) as your html parser, there's nothing to worry about. If you use a custom html parser, you can normalize the node data format manually before piping the output to the query stream.

## examples

For these examples, we'll be using the [atlas-html-stream](https://github.com/atlassubbed/atlas-html-stream#readme) html parser and we'll assume we have a file called `index.html`. The source html doesn't need to be a local file -- perhaps we're piping website data from a socket to our parser.

#### basic queries

Sometimes we want to look up a single html tag that satisfies some conditions, then output the information we found. Let's look up the `DOCTYPE` of our html file:

```javascript
const QueryStream = require("atlas-query-stream");
const file = require("fs").createReadStream("./index.html", {highWaterMark: 5});
const HtmlParser = require("atlas-html-stream");
// define our query
const doctypeQuery = node => {
  if (node.name === "!DOCTYPE"){
    // return a result if we're at the correct node
    return {isHtml: "html" in node.data}
  }
}
// read the file, pipe the parsed nodes to our query stream
file
  .pipe(new HtmlParser())
  .pipe(new QueryStream(doctypeQuery))
  .on("data", data => console.log("html?", data.isHtml))
  .on("end", () => console.log("done reading, parsing and querying the file"))
```

Every 5 bytes we read are sent to the parser, which determines whether or not there's a complete node ready to send to the query stream. If there is, it sends the node to the query stream and our `doctypeQuery` is executed against the node.

Once a basic query returns a result, it is popped off the query stack and never runs again. Once there are no queries left to run, the query stream automatically unpipes itself from the parser. In this case, our query would find its result in the first `15` bytes of the file, meaning this code only ever reads, parses and queries `15` bytes of the file, regardless of how big the file is.

#### recursive queries

Other times, we want to fetch data from multiple tags in an html document, like tabular data or list element data. Suppose we have the following document:

```html
<div id="atlassubbed-packages">
  <a href="https://github.com/atlassubbed/atlas-npm-init">Npm Starter</a>
  <a href="https://github.com/atlassubbed/atlas-webpack-init">Webpack Starter</a>
  <a href="https://github.com/atlassubbed/atlas-html-stream">Html Parser</a>
  <a href="https://github.com/atlassubbed/atlas-quintic-smoothing">x<sup>5</sup> Smoothing</a>
  <a href="https://github.com/atlassubbed/atlas-vector-noise">Perlin Noise</a>
</div>
```

Let's write a recursive query which scrapes all of the urls for us:

```javascript
...
const urlQuery = [({name, data}) => {
  if (name === "a"){
    return data.href
  }
}]

file
  .pipe(new HtmlParser())
  .pipe(new QueryStream(urlQuery))
  .on("data", url => console.log(`scraped url: ${url}`))
  .on("end", () => console.log("done reading file"))
```

One thing to note here is that the query is wrapped in an `Array` literal, `[]`. This tells the query stream to keep running the query even after it finds the first result.

#### aborting queries

Sometimes you want to write a recursive query, but only need it to return a limited number of results. In this case, we can *abort* the query by returning `null`:

```javascript
let numResults = 0;
const firstThreeUrlsQuery = [({name, data}) => {
  if (numResults === 3) return null;
  if (name === "a"){
    numResults++;
    return data.href;
  }
}]
...
```

If you don't like keeping query-specific data outside of the query as we did in this example, you should use nested queries and keep information in a top-level query closure.

#### nested queries

Basic and recursive queries are the building blocks for all other queries. A *nested* query is a query which returns another query, which we'll call a *subquery*. Let's continue with the previous example, except this time, assume that our html snippet is part of a much larger document which contains thousands of anchor tags. In this case, we only the first three atlassubbed package urls! The query in the example above would return the first three urls for any anchor tag. Let's fix it using a nested query:

```javascript
...
// use a nested query to limit the range of a recursive subquery
const onlyAtlassubbedUrlQuery = ({data}) => {
  // since html tag ids are unique, we don't need to check the tag name
  if (data.id === "atlassubbed-packages"){
    // start counting our anchor results
    let numResults = 0;
    return [({name, data}) => {
      if (numResults === 3) return null;
      if (name === "a"){
        numResults++;
        return data.href;
      }
    }]
  }
}
...
```

There is much more possible with nested queries: you can nest basic subqueries inside of recursive queries, you can nest many levels of queries -- do whatever you need to do for your use case.

## advanced examples

If you've made it to this section, then you already know everything you need to know to start using this library. The following examples and discussion will go over certain cases you may run into.

#### querying fractions of a file

To better understand how the query stream works, let's try and query [./test/assets/app.html](./test/assets/app.html). We only care about the `ul` at the beginning of the file, which starts at index `113` and ends at index `236`:

```html
<!-- ./test/assets/app.html -->
<ul>
  <li style="color: blue;">Home</li>
  <li><a href="./about.html">About</a></li>
  <li>Posts</li>
</ul>
```

We want to write two queries:

  1. Get the names of each page in the `ul` "navbar".
  2. Get the very first link we find.

Let's use two `QueryStreams` for illustrative purposes -- although you can do this with one of them. We'll also be writing a bunch of output so you can see *exactly* what is happening under the hood:

```javascript
const QueryStream = require("atlas-query-stream")
const HtmlParser = require("atlas-html-stream");
const { createReadStream } = require("fs");
const str = d => JSON.stringify(d);

// create our streams
const opts = {highWaterMark: 12, start: 113, end: 236};
const file = createReadStream("./test/assets/app.html", opts);
const parser = new HtmlParser();
const getPageNames = new QueryStream([({name}) => {
  if (name === "li") {
    return ({text}) => text;
  }
}])
const getFirstLink = new QueryStream(({name, data}) => {
  if (name === "a"){
    return data.href
  }
})

// begin the job
console.log("start: reading file")
file
  .on("data", d => console.log(`  read: ${d.length} bytes`))
  .on("end", () => console.log(`end: read file`))
console.log("start: parsing file")
const nodeStream = file
  .pipe(parser)
  .on("data", d => console.log(`  parsed: ${str(d)}`))
  .on("end", () => console.log(`end: parsed file`))
console.log("start: running basic query")
nodeStream
  .pipe(getFirstLink)
  .on("data", d => console.log(`    getFirstLink result: ${str(d)}`))
  .on("end", () => console.log(`end: getFirstLink query`))
console.log("start: running recursive query")
nodeStream
  .pipe(getPageNames)
  .on("data", d => console.log(`    getPageNames result: ${str(d)}`))
  .on("end", () => console.log(`end: getPageNames query`))
```

Since the `gtFirstLink` query will complete roughly halfway into the file, we can expect the stream to end earlier than the `getPageNames` query. The `getPageNames` query is recursive, so it will run until the end of the file. Let's take a look at the output:

```
start: reading file
start: parsing file
start: running basic query
start: running recursive query
  read: 12 bytes
  parsed: {"name":"ul","data":{}}
  read: 12 bytes
  read: 12 bytes
  parsed: {"name":"li","data":{"style":"color: blue;"}}
  read: 12 bytes
  parsed: {"text":"Home"}
    getPageNames result: "Home"
  parsed: {"name":"li"}
  read: 12 bytes
  parsed: {"name":"li","data":{}}
  read: 12 bytes
  read: 12 bytes
  parsed: {"name":"a","data":{"href":"./about.html"}}
    getFirstLink result: "./about.html"
end: getFirstLink query
  read: 12 bytes
  parsed: {"text":"About"}
    getPageNames result: "About"
  parsed: {"name":"a"}
  parsed: {"name":"li"}
  read: 12 bytes
  parsed: {"name":"li","data":{}}
  read: 12 bytes
  parsed: {"text":"Posts"}
    getPageNames result: "Posts"
  parsed: {"name":"li"}
  read: 4 bytes
  parsed: {"name":"ul"}
end: read file
end: parsed file
end: getPageNames query
```

As you can see, the `getFirstLink` query stream immediately ends after finding its result, because it was a non-recursive query. The only reason it reads the entire section of the file is so that it can continue getting potential results for the recursive query. Let's see what happens if we run the exact same code, but comment out a few lines:

```javascript
...
// begin the job
console.log("start: reading file")
file
  // .on("data", d => console.log(`  read: ${d.length} bytes`))
  .on("end", () => console.log(`end: read file`))
console.log("start: parsing file")
const nodeStream = file
  .pipe(parser)
  .on("data", d => console.log(`  parsed: ${str(d)}`))
  .on("end", () => console.log(`end: parsed file`))
console.log("start: running basic query")
nodeStream
  .pipe(getFirstLink)
  .on("data", d => console.log(`    getFirstLink result: ${str(d)}`))
  .on("end", () => console.log(`end: getFirstLink query`))
// console.log("start: running recursive query")
// nodeStream
//   .pipe(getPageNames)
//   .on("data", d => console.log(`    getPageNames result: ${str(d)}`))
//   .on("end", () => console.log(`end: getPageNames query`))
```

We've commented out the entire recursive query, as well as our event listener which logs the bytes read from the file. Remember, node.js will continue to pipe something as long as you are listening for the data. Let's look at the output:

```
start: reading file
start: parsing file
start: running basic query
  parsed: {"name":"ul","data":{}}
  parsed: {"name":"li","data":{"style":"color: blue;"}}
  parsed: {"text":"Home"}
  parsed: {"name":"li"}
  parsed: {"name":"li","data":{}}
  parsed: {"name":"a","data":{"href":"./about.html"}}
    getFirstLink result: "./about.html"
end: getFirstLink query
end: read file
```

This time, the file stops streaming data to the parser as soon as the query returns its result. There's no need to continue reading and parsing the file if the query stream no longer has any queries on its stack.

#### writing smarter queries

Basic queries are preferred over recursive queries, since they are not executed after finding a result. If you *must* use a recursive query, ask yourself whether or not you can nest it inside a basic query to narrow down the html subtree in which it runs. When writing a query, it's best to return a non-null falsy *as soon as* you know the query will fail, so you can avoid doing unecessary processing.

For example, suppose your document has 9,020 `li` tags, but you only need to query the 20 `li` tags inside `<ul id="1">`. The following query could work:

```javascript
const liQuery = [node => {
  if (node.name === "li"){
    // do some expensive processing and return a result
  }
}];
```

But, it will be executed on your entire node set, and it will do expensive processing on over 9,000 nodes. Instead, nest your recursive `liQuery` query inside of a basic query:

```javascript
...
const betterQuery = ({data}) => {
  if (data && data.id === "1"){
    return liQuery;
  }
}
```

This query will limit the scope of your `liQuery` to the subtree of `<ul id="1">`. In other words, the `liQuery` is only executed on the 20 `li` tags inside of the target `ul`.

#### multiple queries

All the queries you write can be executed on the same query stream:

```javascript
...
const queries = require("./queries");
// all of your queries will run
const queryStream = new QueryStream(...queries)
```

#### queries as modular plugins

It would be trivial to export a query factory as an npm package, which can then be imported and used like *any* other query. Let's assume there's a third party Reddit comment-scraping query which emits `{author, text, url}` for each comment on a Reddit page. To use it, all we need to do is import it and pass it into our `QueryStream`:

```javascript
const QueryStream = require("atlas-query-stream");
// third party query factory, call the module to get an instance of the query
const pluginQuery = require("some-reddit-comments-query-package")()
// my query which outputs upvote counts for each comment
const upvotesQuery = require("./reddit-upvotes-query")
const engine = new QueryStream(upvotesQuery, pluginQuery)
...
```

In this example, the query stream will output data for the upvotes for each comment (from our query), as well as `{author, text, url}` objects thanks to the plugin.

#### reusing queries

Since subqueries are tracked within the scope of their parent node, make sure you use separate instances of a subquery for different scopes. For example, this is fine:

```javascript
// works for a basic query
const { subquery } = require("./subquery");
const query = ({data}) => {
  if (name === "div"){
    // even if there are multiple divs in the tree,
    // this block runs once, since it's a basic query
    // thus the subquery will only run in one subtree
    return subquery
  }
}
```

However, the following will not work as expected, since we are using the same subquery for potentially multiple different subtrees:

```javascript
// doesn't work for a recursive query
const { subquery } = require("./subquery")
const query = [({name}) => {
  if (name === "div"){
    // this block may run several times
    return subquery
  }
}]
```

The fix is pretty easy with a factory, which returns a new subquery every time it is called:

```javascript
// works
const { makeSubquery } = require("./subquery");
const query = [({name}) => {
  if (name === "div"){
    return makeSubquery()
  }
}]
```

In the above case, each time the `if` block is run, it returns a unique subquery. If you are writing queries, always wrap them in an arrow function so that the caller can use multiple instances if they need to.

## caveats

#### returning data

If a query returns an `Array` or a `Function`, the query stream will assume you are returning another query. Results should be any truthy value except an `Array` or `Function`. If your query needs to return an array of data, return an object with an array field instead: `{results: yourArray}`. Returning any non-null falsy value will tell the query stream that the current query did not find any result. In this case, the query will be re-run in the (sub)tree in which it was started.

#### query order

If you're running multiple queries (e.g. `new QueryStream(...queries)`), make sure your queries are pure and do not depend on each other. This means that code inside query `A` should not talk to code inside query `B` where `stream = new QueryStream(A, B)`. Of course, it's perfectly fine for `A` and `B` to store information across their own closures (e.g. for nested queries).

#### malformatted html

Non-nested queries will work fine if there are missing closing tags. Nested queries won't work as expected if there are missing closing tags in the scope of the subquery, since the query stream uses the nesting level to decide whether or not it should keep running a subquery.

## todo

#### subtrees and substrings

Theoretically, you should be able to write a self-recurring query function which outputs DOM subtrees or html substrings in very few lines of code, although doing so may require us to execute queries on closing nodes when their subtree expires.
