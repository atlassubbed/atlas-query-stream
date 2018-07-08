# atlas-query-stream

A query engine for atlas-html-stream which captures information from an html stream without using a DOM.

[![Travis](https://img.shields.io/travis/atlassubbed/atlas-query-stream.svg)](https://travis-ci.org/atlassubbed/atlas-query-stream)

---

## install

```
npm install --save atlas-query-stream
```

## why

I've used libraries like cheerio, but I found their APIs to be large and counter-intuitive, forcing me to look up syntax for a plethora of functions and types. Using a DOM-based query engine would also force me to construct my html tree in memory before querying it, which is a no-go for large documents and html streaming.

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
const file = require("fs").createReadStream("./index.html");
const HtmlParser = require("atlas-html-stream");
// define our query
const doctypeQuery = node => {
  if (node.name === "!DOCTYPE"){
    // return a result
    return {isHtml: "html" in node.data}
  }
}
// read the file, pipe the nodes to our query stream
file
  .pipe(new HtmlParser())
  .pipe(new QueryStream(doctypeQuery))
  .on("data", data => {
    console.log(`our file ${data.isHtml ? "is" : "isn't"} html`)
  })
  .on("end", () => {
    console.log("done reading file")
  })
```

#### more efficiently

Before we talk about recursive queries, let's fix the example above. My favorite part about streams is that you can shut off the water whenever you want. Suppose we have a 1MB html file and all we want to do is see what the `DOCTYPE` is. In the example above, we inadvertently read the entire html file! Instead, let's stop reading the file *as soon as* we find out what the `DOCTYPE` is. For illustrative purposes, we'll be logging the data we pipe through each stream:

```
...
const { createReadStream } = require("fs")
const optsChunkSize = { highWaterMark: 5 }
const file = createReadStream("./index.html", optsChunkSize)
const parser = new HtmlParser();

// we'll write our query using ES6 fn parameters 
const doctypeQueryEfficient = ({name, data}) => {
  if (name === "!DOCTYPE"){
    parser.end();
    return {isHtml: "html" in data}
  }
}

const log = d => JSON.stringify(d);
file
  .on("data", d => console.log(`streamed ${d.length} bytes`))
  .pipe(parser)
  .on("data", d => console.log(`parsed ${log(d)}`))
  .pipe(new QueryStream(docQuery))
  .on("data", d => console.log(`queried ${log(d)}`))
  .on("end", () => console.log("ended querying"))

// streamed 5 bytes
// streamed 5 bytes
// streamed 5 bytes
// parsed {"name":"!DOCTYPE","data":{"html":""}}
// queried {"isHtml":true}
// ended querying
```

Every 5 bytes from the beginning of the file are piped to the parser, which emits an html node when it finds one, which triggers the query to execute, which in turn signals the parser to stop accepting incoming data.

#### recursive queries

Sometimes, we want to fetch data from multiple tags in an html document, like tabular data or list element data. Suppose we have the following document:

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
  .on("data", url => {
    console.log(`scraped url: ${url}`)
  })
  .on("end", () => {
    console.log("done reading file")
  })
```

One thing to note here is that the query is wrapped in an `Array` literal, `[]`. This tells the query stream to keep running the query even after it finds the first result.

#### nested queries

Basic and recursive queries are the building blocks for all other queries. A *nested* query is a query which returns another query. The child query is called a *subquery*. Let's continue with the previous example, except this time, assume that our html snippet is part of a much larger document which contains thousands of anchor tags. In this case, we only want *my* package urls! The query in the example above would return urls for *every* anchor tag. Let's fix it using a nested query:

```
...
// use a nested query to limit the range of a recursive subquery
const onlyAtlassubbedUrlQuery = ({data}) => {
  // since ids are unique, we don't need to check the tag name
  if (data.id === "atlassubbed-packages"){
    return urlQuery;
  }
}

file
  .pipe(new HtmlParser())
  .pipe(new QueryStream(onlyAtlassubbedUrlQuery))
  .on("data", url => {
    console.log(`scraped atlassubbed url: ${url}`)
  })
  .on("end", () => {
    console.log("done reading file")
  })
```

There is much more possible with nested queries: you can nest basic queries inside recursive queries, you can nest many levels of queries -- do whatever you gotta do for your use case.

## caveats

#### query return values

If you return an `Array` or a `Function`, the query stream will assume you are returning another query. Results should be any truthy value except an `Array` or `Function`. If your query needs to return an array of data, return an object with an array field instead: `{results: yourArray}`. Returning any falsy value will tell the query stream that the current query did not find any result. In this case, the query will be re-run in the subtree in which it was started.

#### malformatted html

Non-nested queries will work fine if there are missing closing tags. Nested queries won't work as expected if there are missing closing tags in the scope of the subquery, since the query stream uses the nesting level to decide whether or not it should keep running a subquery.

#### performance tips

The query stream takes a number of queries and calls them on the nodes it receives from an html parser. Basic queries are not executed on any nodes after a match has been found. Recursive queries are executed indefinitely, since they can return potentially many results. Basic queries are preferred over recursive queries. If you *must* use a recursive query, ask yourself whether or not you can nest it inside a basic query to narrow down the html subtree in which it runs. When writing a query, it's best to return falsy *as soon as* you know the query will fail, so you can avoid doing unecessary processing.

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
