var app = require("../app");


var db = require('mongoose');
var dbtools = require("./fixtures/dbtools");
var should = require("should");
var data = dbtools.fixtures(["Users.js","Categories.js","Orders.find.js"]);

var Products=db.model('Products'), 
    Orders=db.model('Orders');

describe("api.orders.security", function(){
  var request= require('supertest');
  var _ = require("underscore");



  var nextShippingDay=Orders.findCurrentShippingDay();


  before(function(done){

    dbtools.clean(function(e){
      dbtools.load(["../fixtures/Users.js","../fixtures/Categories.js","../fixtures/Orders.find.js"],db,function(err){
        should.not.exist(err);

        // Orders.printInfo()
        // Orders.find({}).exec(function(e,os){
        //   os.forEach(function(o){o.print()})
        // })


        done();
      });
    });      
  });

  
  after(function(done){
    dbtools.clean(function(){    
      done();
    });    
  });

  //
  // keep session
  var cookie;

  it("login",function(done){
    request(app)
      .post('/login')
      .send({ email: "evaleto@gmail.com", password:'password',provider:'local' })
      .end(function(e,res){
        should.not.exist(e)
        cookie = res.headers['set-cookie'];
        done()
      });
  })

  it('GET /v1/orders should return 401 for anonymous',function(done){
    request(app)
      .get('/v1/orders')
      .expect(401,done);
  });


  // sugls: super-shop, un-autre-shop, mon-shop
  it('GET /v1/orders/shops/mon-shop?when=next list open orders for next shipping day ',function(done){
    request(app)
      .get('/v1/orders/shops/mon-shop?when=next')
      .set('cookie', cookie)      
      .expect(200,function(err,res){
        should.not.exist(err)
        res.body.length.should.equal(2)
        for(var o in res.body){
          (nextShippingDay.getTime()).should.equal(new Date(res.body[o].shipping.when).getTime())
          // console.log("vendors",res.body[o].vendors)
        }
        done()
      });  
  });

  it('GET /v1/orders?when=next  list all open orders for admin',function(done){
    request(app)
      .get('/v1/orders?when=next')
      .set('cookie', cookie)      
      .expect(200,function(err,res){

        should.not.exist(err)
        res.body.length.should.equal(4)
        for(var o in res.body){          
          (nextShippingDay).getTime().should.equal(new Date(res.body[o].shipping.when).getTime())
        }
        done()
      });  
  });  

  it('GET /v1/orders/shops/mon-shop?status=fail  ',function(done){
    request(app)
      .get('/v1/orders/shops/mon-shop?status=fail')
      .set('cookie', cookie)      
      .expect(200,function(err,res){
        should.not.exist(err)
        res.body.length.should.equal(0)
        for(var o in res.body){
        }
        done()
      });  
  });  

  it('GET /v1/orders/shops/mon-shop?status=close  ',function(done){
    request(app)
      .get('/v1/orders/shops/mon-shop?status=close')
      .set('cookie', cookie)      
      .expect(200,function(err,res){
        should.not.exist(err)
        res.body.length.should.equal(0)
        for(var o in res.body){
        }
        done()
      });  
  });  

  it('GET /v1/orders?status=close  ',function(done){
    request(app)
      .get('/v1/orders?status=close')
      .set('cookie', cookie)      
      .expect(200,function(err,res){
        should.not.exist(err)
        res.body.length.should.equal(1)
        for(var o in res.body){
        }
        done()
      });  
  }); 

  it.skip('GET /v1/orders?status=fail  ',function(done){
  });  

  


  it('GET /v1/orders/shops/mon-shop list all orders  ',function(done){
    request(app)
      .get('/v1/orders/shops/mon-shop')
      .set('cookie', cookie)      
      .expect(200,function(err,res){
        should.not.exist(err)
        res.body.length.should.equal(3)
        for(var o in res.body){
          // nextShippingDay.should.equals(res.body[o].shipping.when)
        }
        done()
      });  
  });


});

