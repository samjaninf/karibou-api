/**
 * Maintain mongo database
 * http://docs.mongodb.org/manual/reference/operator/#AdvancedQueries-%24type
 * 
 * 
 *  find all product where photo is a string
 *   - convert the field photo:string => photo:{url:string}
 *
 * Use case
 * 1) How to change the type of a field?
 *    see type here http://docs.mongodb.org/manual/reference/operator/type/#op._S_type
 *  db.foo.find( { 'bad' : { $type : 1 } } ).forEach( function (x) {   
 *   x.bad = new String(x.bad); // convert field to string
 *   db.foo.save(x);
 *  });
 *
 * 2) How to rename a field
 *    db.students.update( { _id: 1 }, { $rename: { "name.first": "name.fname" } } )
 *    db.students.update( { _id: 1 }, { $rename: { "name.last": "contact.lname" } } )
 *
 * $type:
 *    Double	1, String	2, Object	3, Array	4, Binary data	5, 
 *    Undefined (deprecated)	6, Object id	7, Boolean	8, Date	9, 
 *    Null	10, Regular Expression	11, JavaScript	13, 
 *    Symbol	14, JavaScript (with scope)	15, 
 *    32-bit integer	16, Timestamp	17, 64-bit integer	18, Min key	255, Max key	127
 *    
 */


exports.execute = function(db, script, callback){
	console.log(script,"Create product.slug from products.title ");
  var logs="", count=0;
  var products=db.collection('products');

  products.find( {slug:{$exists:false}}).toArray(function (err,p) {
	  if (!p.length){
	    return callback(null, "0 product have been updated")
	  }
    console.log(script,"migrating "+p.length +" products");
	  
    //
    // convert url
    require('async').each(p, function(product, eachcb){
      // 
      if(product.slug){
        console.log('WARNING slug is available for this product',product.sku)
        return eachcb();        
      }
      product.slug=product.title.slug();
      console.log('slug:',product.sku,product.slug )
      products.save(product,function(err){
        eachcb(err);        
      });

	  },
	  function(err){
        return callback(err, p.length+" slug on products have been updated");
	  });
  });	
	
}
