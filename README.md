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

```javascript
...
// use a nested query to limit the range of a recursive subquery
const onlyAtlassubbedUrlQuery = ({data}) => {
  // since html tag ids are unique, we don't need to check the tag name
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

There is much more possible with nested queries: you can nest basic subqueries inside of recursive queries, you can nest many levels of queries -- do whatever you gotta do for your use case.

## advanced examples

If you've made it to this section, then you already know everything you need to know to start using this library. The following examples and discussion will go over certain cases you may run into.

#### querying fractions of a file

In our very first example, we walked about reading the `DOCTYPE` of an html file, but we inadvertently ended up reading the entire file! Instead, let's stop reading the file *as soon as* we find out what the `DOCTYPE` is. For illustrative purposes, we'll be logging the data we pipe through each stream:

```javascript
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

const str = d => JSON.stringify(d);
file
  .on("data", d => console.log(`streamed ${d.length} bytes`))
  .pipe(parser)
  .on("data", d => console.log(`parsed ${str(d)}`))
  .pipe(new QueryStream(docQuery))
  .on("data", d => console.log(`queried ${str(d)}`))
  .on("end", () => console.log("ended querying"))

// streamed 5 bytes
// streamed 5 bytes
// streamed 5 bytes
// parsed {"name":"!DOCTYPE","data":{"html":""}}
// queried {"isHtml":true}
// ended querying
```

Every 5 bytes from the beginning of the file are piped to the parser, which emits an html node when it finds one, which triggers the query to execute, which in turn signals the parser to stop accepting incoming data. We may also want to consider the edge case where the `DOCTYPE` is not present.

#### writing smarter queries

Basic queries are preferred over recursive queries, since they are not executed after finding a result. If you *must* use a recursive query, ask yourself whether or not you can nest it inside a basic query to narrow down the html subtree in which it runs. When writing a query, it's best to return falsy *as soon as* you know the query will fail, so you can avoid doing unecessary processing.

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
// works
const { subquery } = require("./subquery");
const query = ({data}) => {
  if (data && data.id === "1"){
    // this block runs once, since ids are unique
    // so the subquery will only ever run in one subtree
    return subquery
  }
}
```

However, the following will not work as expected, since we are using the same subquery for potentially multiple different subtrees:

```javascript
// doesn't work
const { subquery } = require("./subquery")
const query = ({name}) => {
  if (name === "div" || name === "p"){
    return subquery
  }
}
```

The fix is pretty easy with a factory, which returns a new subquery every time it is called:

```javascript
// works
const { makeSubquery } = require("./subquery");
const query = ({name}) => {
  if (name === "div" || name === "p"){
    // this block may run several times
    return makeSubquery()
  }
}
```

In the above case, each time the `if` block is run, it returns a unique subquery. If you are writing queries, always wrap them in an arrow function so that the caller can use multiple instances if they need to.

## caveats

#### returning data

If a query returns an `Array` or a `Function`, the query stream will assume you are returning another query. Results should be any truthy value except an `Array` or `Function`. If your query needs to return an array of data, return an object with an array field instead: `{results: yourArray}`. Returning any falsy value will tell the query stream that the current query did not find any result. In this case, the query will be re-run in the (sub)tree in which it was started.

#### query order

If you're running multiple queries (e.g. `new QueryStream(...queries)`), the order in which they and their subqueries run is set to alternate. This is to avoid using `unshift`. If you are running multiple queries, make sure your queries are pure and do not depend on each other.

#### malformatted html

Non-nested queries will work fine if there are missing closing tags. Nested queries won't work as expected if there are missing closing tags in the scope of the subquery, since the query stream uses the nesting level to decide whether or not it should keep running a subquery.

## todo

#### query return values

Since nested queries depend on the existence of closing tags (i.e. well formatted html), it would be awesome if returning `null` told the engine to "stop running this query, regardless of where it is in the subtree". This could make malformatted html *much* easier to scrape information from, and would solve the "missing `li` closing tags" problem.

#### subtrees and substrings

Theoretically, you should be able to write a self-recurring query function which outputs DOM subtrees or html substrings in very few lines of code, although doing so may require us to execute queries on closing nodes, or call queries without a node (or with *their* closing subtree node) when their subtree expires.
