# atlas-query-stream

A query engine for atlas-html-stream which captures information from an html stream without using a DOM.

[![Travis](https://img.shields.io/travis/atlassubbed/atlas-query-stream.svg)](https://travis-ci.org/atlassubbed/atlas-query-stream)

---

## why

I want to be able to query html files without needing the entire file in memory. Using a DOM-based query engine would force me to construct my html tree in memory before querying it. This package lets you define recursive crawlers that fetch information from a continuous stream of html nodes. Once you find the information you are looking for, you can end the html stream immediately without reading the rest of the file.

Use [atlas-html-stream](https://github.com/atlassubbed/atlas-html-stream#readme) to obtain a continuous stream of html nodes from a file. Since this all done on-the-fly, it will work with malformatted html.

## examples

Todo.