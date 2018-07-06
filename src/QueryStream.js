const { Transform } = require("stream");
const { isArr } = require("./util");

module.exports = class QueryStream extends Transform {
  constructor(...queries){
    super({objectMode: true})
    if (!queries.length) 
      throw new Error("requires at least one query");
    const cur = {}, levs = [];
    let jobs = queries, id = 0;
    this.query = node => {
      // todo
    }
  }
  _transform(node, encoding, done){
    if (node === null) return this.end();
    this.query(node)
    done(null)
  }
  _flush(done){
    done(null)
  }
}
