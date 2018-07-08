const { describe, it } = require("mocha")
const { expect } = require("chai")
const { Transform } = require("stream");
const QueryStream = require("../src/QueryStream");
const { query, getTextIndices, getNodeIndices } = require("./helpers");
const parallel = require("atlas-parallel");

const textIndices = getTextIndices();
const nodeIndices = getNodeIndices();
const numberOfNodes = nodeIndices.length;
const numberOfTextNodes = textIndices.length;

describe("QueryStream", function(){
  it("should throw error if instantiated without query", function(){
    expect(() => new QueryStream()).to.throw("requires at least one query")
  })
  it("should create an instance of a stream Transform", function(){
    const queries = new QueryStream(() => {});
    expect(queries).to.be.an.instanceOf(Transform)
  })
  describe("non-recursive queries", function(){
    it("should not support nested queries on text nodes", function(testDone){
      const indexOfFirstTextNode = textIndices[0]
      const truthyValues = [true, 5, {}, [], () => {}, "str", new Date(), /reg/];
      parallel(truthyValues.map(val => done => {
        let calledCount = 0;
        query([({text}) => {
          calledCount++;
          return text && val;
        }], res => {
          expect(res.length).to.equal(1);
          expect(res[0]).to.deep.equal(val);
          expect(calledCount).to.equal(indexOfFirstTextNode+1);
          done()
        })
      }), () => testDone())
    })
    it("should not be executed after finding a truthy result", function(testDone){
      const truthyResults = [true, 5, {}, "str", new Date(), /reg/];
      parallel(truthyResults.map(val => done => {
        let calledCount = 0;
        query([node => {
          calledCount++;
          return val;
        }], res => {
          expect(res.length).to.equal(1);
          expect(res[0]).to.deep.equal(val);
          expect(calledCount).to.equal(1);
          done();
        })
      }), () => testDone())
    })
    it("should continue running if it returns a falsy value", function(testDone){
      const falsyResults = [undefined, NaN, "", 0, false, null, -0, ''];
      parallel(falsyResults.map(val => done => {
        let calledCount = 0;
        query([node => {
          calledCount++;
          return val;
        }], res => {
          expect(res.length).to.equal(0);
          expect(calledCount).to.equal(numberOfNodes);
          done();
        })
      }), () => testDone())
    })
    it("should run a non-recursive child query on at most every subnode of the matching node", function(done){
      let calledSubqueryCount = 0;
      query([({name}) => {
        if (name === "head") return node => {
          calledSubqueryCount++;
        }
      }], res => {
        expect(res.length).to.equal(0);
        expect(calledSubqueryCount).to.equal(2);
        done()
      })
    })
    it("should always run a recursive child query on every subnode of the matching node", function(done){
      let calledSubqueryCount = 0;
      query([({name}) => {
        if (name === "head") return [node => ++calledSubqueryCount]
      }], res => {
        expect(res.length).to.equal(2);
        expect(calledSubqueryCount).to.equal(2);
        expect(res).to.deep.equal([1,2])
        done()
      })
    })
  })
  describe("recursive queries", function(){
    it("should not support nested queries on text nodes", function(testDone){
      const indexOfFirstTextNode = textIndices[0]
      const truthyValues = [true, 5, {}, [], () => {}, "str", new Date(), /reg/];
      parallel(truthyValues.map(val => done => {
        let calledCount = 0;
        query([[({text}) => {
          calledCount++;
          return text && val;
        }]], res => {
          expect(res.length).to.equal(numberOfTextNodes);
          res.forEach(r => expect(r).to.deep.equal(val))
          expect(calledCount).to.equal(numberOfNodes);
          done()
        })
      }), () => testDone())
    })
    it("should be executed on every node after finding a truthy result", function(testDone){
      const truthyResults = [true, 5, {}, "str", new Date(), /reg/];
      parallel(truthyResults.map(val => done => {
        let calledCount = 0;
        query([[node => {
          calledCount++;
          return val;
        }]], res => {
          expect(res.length).to.equal(numberOfNodes);
          res.forEach(r => expect(r).to.deep.equal(val))
          expect(calledCount).to.equal(numberOfNodes);
          done();
        })
      }), () => testDone())
    })
    it("should continue running if it returns a falsy value", function(testDone){
      const falsyResults = [undefined, NaN, "", 0, false, null, -0, ''];
      parallel(falsyResults.map(val => done => {
        let calledCount = 0;
        query([[node => {
          calledCount++;
          return val;
        }]], res => {
          expect(res.length).to.equal(0);
          expect(calledCount).to.equal(numberOfNodes);
          done();
        })
      }), () => testDone())
    })
    it("should run a non-recursive child query on at most every subnode of all matching nodes", function(done){
      // calledChildCount should equal the numberOfChildNodes of the matching node
      // test with a child query which returns false.
    })
    it("should always run a recursive child query on every subnode of all matching nodes", function(done){
      // calledChildCount should equal the numberOfChildNodes of the matching node
      // test with a child query which returns true.
    })
  })
  describe("multiple queries", function(){
    it("should run all the provided queries", function(done){
      let calledQ1 = 0, calledQ2 = 0
      const q1 = () => ++calledQ1 === 3;
      const q2 = [() => !!++calledQ2]
      query([q1,q2], res => {
        expect(calledQ1).to.equal(3)
        expect(calledQ2).to.equal(numberOfNodes)
        expect(res.length).to.equal(numberOfNodes+1);
        res.forEach(r => expect(r).to.be.true)
        done()
      })
    })
  })
})
