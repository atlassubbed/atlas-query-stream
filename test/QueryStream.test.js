const { describe, it } = require("mocha")
const { expect } = require("chai")
const { Transform } = require("stream");
const QueryStream = require("../src/QueryStream");

describe("QueryStream", function(){
  it("should throw error if instantiated without query", function(){
    expect(() => new QueryStream()).to.throw("requires at least one query")
  })
  it("should create an instance of a stream Transform", function(){
    const queries = new QueryStream(() => {});
    expect(queries).to.be.an.instanceOf(Transform)
  })
})
