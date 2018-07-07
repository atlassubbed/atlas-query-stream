const { describe, it } = require("mocha")
const { expect } = require("chai")
const { Transform } = require("stream");
const QueryStream = require("../src/QueryStream");
const { query, nodeStats } = require("./helpers");

const { 
  nodeIndices: { length: numberOfNodes },
  textIndices: { length: numberOfTextNodes }
} = nodeStats;

describe("QueryStream", function(){
  it("should throw error if instantiated without query", function(){
    expect(() => new QueryStream()).to.throw("requires at least one query")
  })
  it("should create an instance of a stream Transform", function(){
    const queries = new QueryStream(() => {});
    expect(queries).to.be.an.instanceOf(Transform)
  })
  it("should run a non-recursive query until it finds the first result", function(done){
    let calledQuery = 0;
    const indexOfFirstResult = nodeStats.textIndices[0]
    const textQuery = node => {
      calledQuery++;
      if (node.text) return "found";
    }
    query([textQuery], res => {
      expect(calledQuery).to.equal(indexOfFirstResult+1)
      expect(res.length).to.equal(1);
      expect(res[0]).to.equal("found")
      done();
    });
  })
  it("should run a recursive query indefinitely", function(done){
    let calledQuery = 0;
    const recursiveTextQuery = [node => {
      calledQuery++;
      if (node.text) return "found";
    }]
    query([recursiveTextQuery], res => {
      expect(calledQuery).to.equal(numberOfNodes)
      expect(res.length).to.equal(numberOfTextNodes);
      res.forEach(r => expect(r).to.equal("found"))
      done();
    });
  })
  it("should run multiple queries", function(done){
    let calledQ1 = 0, calledQ2 = 0
    const q1 = node => ++calledQ1 === 3;
    const q2 = [({text}) => ++calledQ2 && !!text]
    query([q1,q2], res => {
      expect(calledQ1).to.equal(3)
      expect(calledQ2).to.equal(numberOfNodes)
      expect(res.length).to.equal(numberOfTextNodes+1);
      res.forEach(r => expect(r).to.be.true)
      done()
    })
  })
  it("should continue running a query as long as it returns a falsy value", function(done){
    const falsyValues = [undefined, NaN, "", 0, false, null, -0, '']
    const calledCount = falsyValues.map(val => 0)
    const queries = falsyValues.map((val,i) => () => {
      calledCount[i]++
      return val
    })
    query(queries, res => {
      expect(res.length).to.equal(0);
      calledCount.forEach(c => expect(c).to.equal(numberOfNodes))
      done()
    })
  })
})



/* Input: open, close, and text nodes from a tree-markup parser
 * Output: Results form the queries, which are arbitrary objects.
 * Arguments: Each argument is a query to run on the input stream.
 *   Query: A function which returns either another query, results, or falsy.
 *     Function: Runs until it gets a single result
 *     Array[Function]: Runs indefinitely, returning potentially many results.
 *   
 */
