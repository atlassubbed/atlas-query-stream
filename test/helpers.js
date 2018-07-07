const QueryStream = require("../src/QueryStream");
const { Readable } = require("stream");
const sourceNodes = require("./assets/app");

// mocks atlas-html-stream's readable interface
class NodeStream extends Readable {
  constructor(opts={}){
    opts.objectMode = true;
    super(opts);
    let i = 0;
    this.getNode = () => sourceNodes[i++] || null;
  }
  _read(){
    this.push(this.getNode())
  }
}

// query an html node stream and return a list of results
const query = (queries, cb) => {
  const nodeStream = new NodeStream();
  const queryStream = new QueryStream(...queries);
  const results = [];
  nodeStream.pipe(queryStream)
    .on("data", r => results.push(r))
    .on("end", () => cb(results))
}

const nodeStats = {
  nodeIndices: [],
  textIndices: [],
};

for (let i = 0; i < sourceNodes.length; i++){
  const { text, data, name } = sourceNodes[i];
  if (data || text) nodeStats.nodeIndices.push(i);
  if (text) nodeStats.textIndices.push(i);
}

module.exports = { query, nodeStats }
