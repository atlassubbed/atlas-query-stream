const { Transform } = require("stream");
const { isArr, isQuery, isNew, isText } = require("./util");

module.exports = class QueryStream extends Transform {
  constructor(...queries){
    super({objectMode: true})
    if (!queries.length) 
      throw new Error("requires at least one query");
    let jobs = queries, tag, levs = {};
    this.query = node => {
      if (tag = node.name) levs[tag] = levs[tag] || 0;
      if (!isNew(node)) return levs[tag]--
      let job, res, next = [], recur;
      while(job = jobs.pop()){
        if (job._lev > levs[job._tag]) continue;
        res = ((recur = isArr(job)) ? job[0] : job)(node);
        if (!res) {next.push(job); continue}
        recur && next.push(job)
        if (!isQuery(res) || isText(node)) this.push(res);
        else res._tag = tag, res._lev = 1+levs[tag], next.push(res);
      }
      tag && levs[tag]++, jobs = next;
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
