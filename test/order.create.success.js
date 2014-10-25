// Use a different DB for tests
var app = require("../app");

var db = require('mongoose');
var dbtools = require("./fixtures/dbtools");
var should = require("should");
var data = dbtools.fixtures(["Users.js","Categories.js","Orders.find.js"]);

var Products=db.model('Products')
  , Orders=db.model('Orders')
  , today=new Date()
  , toshortDay
  , okDay
  , timelimitH=config.shop.order.timelimitH
  , timelimit=config.shop.order.timelimit
  , timeoutAndNotPaid=config.shop.order.timeoutAndNotPaid;





/**
 * create order successfuly :
 *  - avoid multiple user create order in the same time
 *  - update all product quantity
 *  - send email
 */

describe("orders.create.success", function(){
  var _ = require("underscore");


  okDay=Orders.findNextShippingDay();
  toshortDay=Orders.findCurrentShippingDay();

  // select a shipping time
  okDay.setHours(11,0,0,0)




  before(function(done){
    dbtools.clean(function(e){
      dbtools.load(["../fixtures/Users.js","../fixtures/Categories.js","../fixtures/Orders.find.js"],db,function(err){
        should.not.exist(err);
        // Orders.find({}).exec(function(e,os){
        //   os.forEach(function(o){
        //     o.print();
        //   })
        // })

        done();
      });
    });      
  });

  
  after(function(done){
    dbtools.clean(function(){    
      config.shop.order.timelimitH=timelimitH;
      config.shop.order.timelimit=timelimit;
      config.shop.order.timeoutAndNotPaid=timeoutAndNotPaid;
      done();
    });    
  });



  it("Checking status after creating a new order ", function(done){
    var customer=data.Users[1];
    var shipping=customer.addresses[0];
    var payment={alias:((customer.id+"postfinance").hash().crypt()),issuer:"postfinance",number:'12xxxxxxx3456'};
    var items=[];
    items.push(Orders.prepare(data.Products[0], 2, ""))
    items.push(Orders.prepare(data.Products[1], 3, ""))
    items.push(Orders.prepare(data.Products[3], 3, ""))

    shipping.when=okDay
    // shipping.when=Orders.jumpToNextWeekDay(new Date(),0) // sunday is noz



    //
    // starting process of order,
    //  - items, customer, shipping
    Orders.create(items, customer, shipping, payment, function(err,order){
      //console.log(order.items[0])
      should.not.exist(err)

      //
      // check fullfillments after creation
      order.fulfillments.status.should.equal('reserved')

      //
      // check financial status after creation
      should.not.exist(order.financial_status)

      //
      // check items fields, price and finalprice
      should.exist(order.items[0].part)
      //
      // checking discount price
      order.items[0].quantity.should.equal(2)
      order.items[0].finalprice.should.equal(data.Products[0].pricing.discount*2)

      //
      // checking normal price
      order.items[1].quantity.should.equal(3)
      order.items[1].finalprice.should.equal(data.Products[0].pricing.price*3)
      order.rollbackProductQuantityAndSave(function(err,order){
        done();                  
      })
      // console.log(order.oid)
      // console.log(JSON.stringify(order))
    });
  });   


  it("Checking product stock after creating a new order ", function(done){
    var customer=data.Users[1];
    var shipping=customer.addresses[0];
    var payment={alias:((customer.id+"postfinance").hash().crypt()),issuer:"postfinance",number:'12xxxxxxx3456'};
    var items=[];
    items.push(Orders.prepare(data.Products[0], 2, ""))
    items.push(Orders.prepare(data.Products[1], 3, ""))
    items.push(Orders.prepare(data.Products[3], 3, ""))

    shipping.when=okDay
    // shipping.when=Orders.jumpToNextWeekDay(new Date(),0) // sunday is noz



    //
    // starting process of order,
    //  - items, customer, shipping
    Orders.create(items, customer, shipping, payment, function(err,order){
      //console.log(order.items[0])
      should.not.exist(err)

      //
      // check fullfillments after creation
      order.fulfillments.status.should.equal('reserved')

      //
      // check financial status after creation
      should.not.exist(order.financial_status)

      //
      // verify items quantity and product stock
      var skus=_.collect(items,function(item){return item.sku});
      Products.findBySkus(skus).exec(function(err,products){
        products.every(function(product, i){
            // console.log(data.Products[i].sku,items[i].sku,product.sku)
            items[i].sku.should.equal(product.sku)

            //
            // this is the updated stock value
            var stock=data.Products[i].pricing.stock-items[i].quantity
            // console.log("test",data.Products[i].pricing.stock, stock, product.pricing.stock)
            product.pricing.stock.should.equal(stock)
            true.should.equal(stock>0);
            return true;
        })
        done();          
      });

      // checking discount price
      order.items[0].quantity.should.equal(2)
      order.items[1].quantity.should.equal(3)

      // console.log(order.oid)

    });
  }); 

  //
  // order is in timeout if payment status != 'paid' and created<1s (timeoutAndNotPaid) 
  // for testing timeout = 100[ms]
  it("Error:an order with status created and not paid is no more available after a timeout", function(done){
    setTimeout(function(){
      Orders.findByTimeoutAndNotPaid(function(err,orders){
        // orders.forEach(function(order){
        //   console.log(order.oid,new Date(order.created).getTime(),order.payment.status)
        // })
        
        // create on test   2000001 1396791546324 'pending', closed null
        //                  2000000 1396791546291 'pending', closed null
        // created on load. 2000006 1396791545738 'pending', closed null
        orders.length.should.equal(2)
        var oids=[2000001,2000006];
        oids.should.include(orders[0].oid)
        oids.should.include(orders[1].oid)
        done();
      })
    },config.shop.order.timeoutAndNotPaid*1000+10)
  }); 

  it.skip("you can rollback an order only if fulfillments=='partial', payment!=='paid' and closed is null",function(done){
    Orders.findByTimeoutAndNotPaid().where('oid').in([2000006,2000000]).exec(function(err,orders){
      orders.forEach(function(order){
        console.log(order.oid,new Date(order.created).getTime(),order.payment.status)
      })              
    });

    done();
  })
});

