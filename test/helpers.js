const QueryStream = require("../src/QueryStream");
const { Readable } = require("stream");
const sourceNodes = require("./assets/app");

// mocks atlas-html-stream's readable interface
class NodeStream extends Readable {
  constructor(opts={}){
    opts.objectMode = true;
    super(opts);
    this.readCount = 0;
  }
  _read(){
    this.push(sourceNodes[this.readCount++] || null)
  }
}

// query an html node stream and return a list of results
const query = (queries, cb) => {
  const nodeStream = new NodeStream({highWaterMark: 1});
  const queryStream = new QueryStream(...queries);
  const results = [];
  nodeStream.pipe(queryStream)
    .on("data", r => results.push(r))
    .on("end", () => cb(results))
  return nodeStream;
}

const getTextIndices = () => {
  let indices = [];
  for (let i = 0; i < sourceNodes.length; i++)
    if (sourceNodes[i].text) indices.push(i);
  return indices;
}

const getNodeIndices = (until=sourceNodes.length) => {
  let indices = [];
  for (let i = 0; i < until; i++){
    const { data, text } = sourceNodes[i]
    if (data || text) indices.push(i);
  }
  return indices;
}

module.exports = { query, getTextIndices, getNodeIndices }
