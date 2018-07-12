# how atlas-query-stream works

## preface

`QueryStream` is responsible for turning parsed html nodes into meaningful data. You may pipe the output of any parser which uses the same output convention as [atlas-html-stream](https://github.com/atlassubbed/atlas-html-stream#readme) to an instance of `QueryStream`.

The parsed data is analyzed on-the-fly inside your queries, and then forgotten; there is no data-persistence other than what you do in your queries. To better understand how `QueryStream` works, let's query a fraction of [../test/assets/app.html](../test/assets/app.html).

## querying fractions of a file

Taking a look at the `app.html` file, we only care about the `ul` (our "navbar") at the beginning of the file, which starts at index `113` and ends at index `236`:

```html
...
<ul>
  <li style="color: blue;">Home</li>
  <li><a href="./about.html">About</a></li>
  <li>Posts</li>
</ul>
...
```

### 1. create our streams and queries

We want to write two queries:

  1. Get the names of each page in our `ul`.
  2. Get the very first link we find.

Let's use two `QueryStream`s for illustrative purposes -- although you can do this with one of them. We'll also be writing a bunch of output so you can see what is happening:

```javascript
const QueryStream = require("atlas-query-stream")
const HtmlParser = require("atlas-html-stream");
const { createReadStream } = require("fs");

// create our streams
const opts = {highWaterMark: 12, start: 113, end: 236};
const file = createReadStream("./app.html", opts);
const parser = new HtmlParser();
const getPageNames = new QueryStream([({name}) => {
  // at an li
  if (name === "li") {
    // return a subquery which returns the nested text
    return ({text}) => text;
  }
}])
const getFirstLink = new QueryStream(({name, data}) => {
  // at an anchor
  if (name === "a"){
    // return the url
    return data.href
  }
})
```

### 2. read and query the file

```javascript
...
// object logger helper
const str = obj => JSON.stringify(obj);

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

Since the `getFirstLink` query will complete roughly halfway into the file, we can expect that stream to end earlier than the `getPageNames` query stream. The `getPageNames` query is recursive, so it will run until the end of the snippet. Let's take a look at the output:

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

As you can see, the `getFirstLink` query stream immediately ends after finding its result, because it is a non-recursive query. The only reason the parser reads the entire section of the file is so that it can continue getting potential results for the recursive query, which is still an active listener on the parser.

### 3. commenting out the recursive query

Let's see what happens if we run the exact same code, but comment out our recursive query:

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

We've commented out the entire recursive query, as well as our event listener which logs the bytes read from the file. Remember, Node.js streams will continue streaming data as long as you are listening for it. Alternatively, we could have detached the listener in our code. Anyway, let's look at the output:

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

## discussion

`QueryStream` is a stream, not a DOM generator -- nonetheless, it lets you crawl a DOM. Each query paints out a very particular path in the DOM defined by you (usually a subtree of the entire DOM). For all intents and purposes, this path of the DOM exists in the closures defined by the (nested) query.

In our case, there's no reason to parse the file after we've fully parsed the very first `ul` in the file, since all the information we care about is inside the first `ul`. Similarly, if we aren't interested in `getPageNames`, there's no reason to fully parse the first `ul` if we've already found the first `a` tag inside the `ul`. 

The query stream only *unpipes* itself from its sources when it's done establishing the outcome of every query it was given. Node.js automatically shuts down a source when there are no remaining data listeners.
