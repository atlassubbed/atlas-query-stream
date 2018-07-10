const { Transform } = require("stream");
const { isArr, isQuery, isNew, isText } = require("./util");

module.exports = class QueryStream extends Transform {
  constructor(...queries){
    super({objectMode: true})
    if (!queries.length) 
      throw new Error("requires at least one query");
    let jobs = queries, tag, levs = {}, srcs = [];
    this.on("pipe", src => srcs.push(src));
    this._unpipe = src => {while(src = srcs.pop()) src.unpipe(this)}
    this.query = node => {
      if (tag = node.name) levs[tag] = levs[tag] || 0;
      if (!isNew(node)) return levs[tag]-- || 1;
      let job, res, next = [], recur;
      while(job = jobs.pop()){
        if (job._lev > levs[job._tag]) continue;
        res = ((recur = isArr(job)) ? job[0] : job)(node);
        if (!res) {res !== null && next.push(job); continue}
        recur && next.push(job)
        if (!isQuery(res) || isText(node)) this.push(res);
        else res._lev = 1+levs[res._tag = tag], next.push(res);
      }
      return (tag && levs[tag]++, jobs = next).length;
    }
  }
  _transform(node, encoding, done){
    if (node === null) return this.end();
    if (!this.query(node)) this._unpipe(), this.end();
    done(null)
  }
  _flush(done){
    done(null)
  }
}
