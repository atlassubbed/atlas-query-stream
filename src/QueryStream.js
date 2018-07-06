const { Transform } = require("stream");
const { isArr } = require("./util");

module.exports = class QueryStream extends Transform {
  constructor(...queries){
    super({objectMode: true})
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
