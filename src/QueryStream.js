const { Transform } = require("stream");
const { isArr, isFn } = require("./util");

module.exports = class QueryStream extends Transform {
  constructor(...queries){
    super({objectMode: true})
    if (!queries.length) 
      throw new Error("requires at least one query");
    const cur = {}, levs = [];
    let jobs = queries, id = 0;
    this.query = node => {
      if (node.data) levs.push(++id)
      else if (node.name) {
        let top, topJobs;
        if (topJobs = cur[top = levs.pop()]) jobs.push(...topJobs);
        return (cur[top] = null);
      }
      let job, res, nextJobs = [], findMany;
      while (job = jobs.pop()){
        if (job.id && !cur[job.id]) continue;
        findMany = isArr(job), res = findMany ? job[0](node) : job(node)
        if (!res) nextJobs.push(job)
        else if (node.text) findMany && nextJobs.push(job), this.push(res)
        else if (isArr(res) || isFn(res)){
          cur[id] = cur[id] || [], findMany && cur[id].push(job)
          res.id = id, nextJobs.push(res)
        } else findMany && (cur[id] = cur[id] || []).push(job), this.push(res)
      }
      jobs = nextJobs
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
