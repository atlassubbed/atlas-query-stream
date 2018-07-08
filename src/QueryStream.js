const { Transform } = require("stream");
const { isArr, isQuery, isNew, isText } = require("./util");

module.exports = class QueryStream extends Transform {
  constructor(...queries){
    super({objectMode: true})
    if (!queries.length) 
      throw new Error("requires at least one query");
    let jobs = queries, name, levs = {};
    this.query = node => {
      if (name = node.name) levs[name] = levs[name] || 0;
      if (!isNew(node)) return levs[name]--
      let job, res, next = [], recur;
      while(job = jobs.pop()){
        if (job._lev > levs[job._name]) continue;
        res = ((recur = isArr(job)) ? job[0] : job)(node);
        if (!res) next.push(job);
        else if (!isQuery(res) || isText(node))
          recur && next.push(job), this.push(res);
        else {
          res._name = name, res._lev = levs[name] + 1
          recur && next.push(job), next.push(res)
        }
      }
      name && levs[name]++, jobs = next;
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
