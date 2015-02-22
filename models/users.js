
var db = require('mongoose')
  , Schema   = db.Schema
  , ObjectId = Schema.ObjectId
  , validate = require('mongoose-validate')
	, passport = require('passport')
  , payment = require('../app/payment')
  , bus = require('../app/bus')
  , Q = require('q')
  , _ = require('underscore');

//var	bcrypt = require('bcrypt');

 /* Enumerations for field validation */
 var EnumGender="homme femme".split(' ');
 var EnumProvider="twitter facebook goolge persona local".split(' ');
 var EnumRegion=config.shop.region.list;


// validate URL
validate.url = function (value) {
  try {
   check(value).len(10, 200).regex(/(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/);
  } catch(err) {
   return false;
  }
  return true;
};

// validate postal code
validate.postal = function (value) {
  try {
   check(value).isAlpha();
  } catch(err) {
   return false;
  }
  return true;
};


 // Normalized profile information conforms to the contact schema established by Portable Contacts.
 // http://portablecontacts.net/draft-spec.html#schema
 // MongoError: E11000 duplicate key error index: karibou-devel.users.$email.address_1  dup key: { : null }
 var UserSchema = new Schema({
    /* A unique identifier for the user, as generated by the service provider.  */
    id    : {type:Number, required: true, unique: true},

    /* The provider which with the user authenticated (facebook, twitter, etc.) */
    provider: {type:String, required: true, unique: false, enum: EnumProvider},

    email:{
      address:{type : String, index:true, unique: true, sparse: true, required : false,
        validate:[validate.email, 'adresse email invalide']
      },
      status:Schema.Types.Mixed,
    },

    /* The name of this user, suitable for display.*/
    displayName:String,
    name: {
        familyName: String,
        givenName: String
    },

    birthday: Date,
    gender: {type:String, enum:EnumGender},
    tags: [String],
    url:{type:String, validate:[validate.url,'Invalide URL format or lenght']},

    phoneNumbers: [{
        number:{ type: String },
        what:{ type: String }
    }],

    photo: String,

    addresses: [{
          name: { type: String, required : true, lowercase: true, trim: true },
          note: { type: String, trim: true },
          floor: { type: String, trim: true, required : true },
          streetAdress: { type: String, required : true, lowercase: true, trim: true },
          region: { type: String, required : true, trim: true, default:"Genève", enum: EnumRegion },
          postalCode: { type: String, required : false /**,
            validate:[validate.postal,'Invalide postal code'] **/
          },
          primary:{ type: Boolean, required : true, default:false},
          geo:{
            lat:{type:Number, required: true},
            lng:{type:Number, required: true}
          }
    }],

    /* preferred products*/
    likes: [Number],

    /* The available Shop for this user */
    shops: [{type: Schema.Types.ObjectId, ref : 'Shops'}],

    /* disqus sso */
    context:{type:Schema.Types.Mixed},

    /* payments methods */
    payments:[{type:Schema.Types.Mixed, unique: true}],
    // payments:[{
    //   type:{type:String},
    //   name:{type:String},
    //   number:{type:String},
    //   expiry:{type:String},
    //   provider:{type:String,unique:true,required:true},
    //   alias:{type:String,unique:true,required:true}
    // }],

    gateway_id    : {type:String, unique: true, select:false,sparse: true},

    /* make user valid/invalid */
    status:{type:Boolean, default: true},

    /* password and creation date (for local session only)*/
    created:{type:Date, default: Date.now},
    updated:{type:Date, default: Date.now},
    logged:{type:Date, default: Date.now},

		salt: { type: String, required: false,select:false},
		hash: { type: String, required: false,select:false},
		roles: Array,
    rank: String
});


UserSchema.statics.findOrCreate=function(u,callback){
	var Users=this.model('Users'),
      criteria={};

  // find by id
  if(u.id){
    criteria.id=u.id
  }

  //find by email
  if(u['email.address']){
    criteria['email.address']=u['email.address']
  }

  Users.findOne(criteria).exec(function(err, user){
    if(!user){
      //
      // user should be created
      if (u.provider==='local'){
        return callback("L'utilisateur ne peut pas être créer automatiquement");
      }

      if (!u.id && u['email.address']){
        //
        // this question is essential but it need a promise
        // db.model('Sequences').nextUser(function(uid){
        //})

        u.id=u['email.address'].hash()
        u["email.status"]=true;
      }
      var newuser=new Users(u);


      newuser.save(function(err){
        //if ( err && err.code === 11000 )
        callback(err,newuser);
      });
    }else{
      if(u.provider&&(user.provider!==u.provider)){
        return callback("L'identifiant est déja utilisé par le provider "+user.provider, null);
      }

      //
      // keep on track login
      user.logged=new Date()
      user.save();

      callback(err, user);
    }
  });

};



UserSchema.statics.findByEmail = function(email, success, fail){
  return this.model('Users').findOne({'email.address':email}).populate('shops').exec(function(err,user){
    if(err){
      fail(err)
    }else{
      success(user);
    }
  });
};

UserSchema.statics.findByToken = function(token, success, fail){
  return this.model('Users').findOne({provider:token}).populate('shops').exec(function(err,user){
    if(err){
      fail(err)
    }else{
      success(user);
    }
  });
};


// TODO this should be stored in db
UserSchema.methods.populateRoles=function(){
  var user=this;
  config.admin.emails.forEach(function(admin){
    if (user&&user.email.address === admin){
      user.roles.push('admin');
    }
  });

  // check for admin role
  config.logistic.emails.forEach(function(logistic){
    if (user&&user.email.address === logistic){
      user.roles.push('logistic');
    }
  });  
}


UserSchema.methods.getDisquSSO=function(){
  var DISQUS_SECRET = config.disqus.secret;
  var DISQUS_PUBLIC = config.disqus.pub;

  var disqusData = {
    id: this.id,
    username: this.display(),
    email: this.email.address
  };

  var disqusStr = JSON.stringify(disqusData);
  var timestamp = Math.round(+new Date() / 1000);

  /*
   * Note that `Buffer` is part of node.js
   * For pure Javascript or client-side methods of
   * converting to base64, refer to this link:
   * http://stackoverflow.com/questions/246801/how-can-you-encode-a-string-to-base64-in-javascript
   */
  var message = new Buffer(disqusStr).toString('base64');

  /*
   * CryptoJS is required for hashing (included in dir)
   * https://code.google.com/p/crypto-js/
   */
  // var result = CryptoJS.HmacSHA1(message + " " + timestamp, DISQUS_SECRET);
  // var hexsig = CryptoJS.enc.Hex.stringify(result);

  var hexsig = require('crypto').createHmac('sha1',DISQUS_SECRET).update(message + " " + timestamp).digest("hex");


  return {
    pubKey: DISQUS_PUBLIC,
    auth: message + " " + hexsig + " " + timestamp
  };

}

UserSchema.methods.isAdmin = function () {
  return this.hasRole('admin');
};

UserSchema.methods.hasRole = function (role) {
 for (var i = 0; i < this.roles.length; i++) {
   if (this.roles[i] === role) {
     // if the role that we are chekign matches the 'role' we are
     // looking for return true
     return true;
   }

 };
 // if the role does not match return false
 return false;
};

UserSchema.methods.addLikes = function(sku, callback){
  var user=this;
  user.likes.push(sku);
  return user.save(callback);
};

UserSchema.methods.removeLikes = function(sku, callback){
  var idx=this.likes.indexOf(parseInt(sku))
  if(idx===-1){
    return callback(null,this)
  }
  this.likes=this.likes.slice(parseInt(sku),1);
  return this.save(callback);
};

//
// like product
UserSchema.statics.like=function(id,sku,callback){
  var Users=this.model('Users'), Products=this.model('Products');

  return Users.findOne({id:id}).exec(function (err, user) {

    if(err){
      return callback(err);
    }
    if(!user){
      return callback("Utilisateur inconnu");
    }



    // remove like?
    // var product=_.find(user.likes, function(p){return p.sku==sku});
    if (user.likes&&user.likes.indexOf(sku)!==-1){
        return user.removeLikes(sku,callback)
    }
    return user.addLikes(sku,callback)


    // return Products.findOneBySku(sku,function(err,product){
    //   return user.addLikes(product,callback)
    // })

  });
};

UserSchema.methods.display = function(){
  if (this.displayName)return this.displayName;
  if (this.name && (this.name.givenName || this.name.familyName)) {
    return this.name.givenName+' '+this.name.familyName
  }
  if (this.id){
    return this.id+'@'+this.provider;
  }

  return 'Anonymous';
};

UserSchema.statics.login = function(email, password, callback){
  console.log("login",email, password);
};


/**
 * local registration
 * - virtual field for password (mapped to salt && hash)
 * - verify password
 * - authenticate
 * - register
 */
UserSchema.virtual('password').get(function () {
  return this._password;
});

UserSchema.virtual('password').set(function (password) {
  this._password = password;

// more safe
//  var salt = this.salt = bcrypt.genSaltSync(10);
//  this.hash = bcrypt.hashSync(password, salt);
  var crypto= require('crypto');
  var salt  = this.salt = crypto.randomBytes(32).toString('base64');
  // FIXME hash method are not safe, use bcrypt
  this.hash = crypto.createHash('sha1').update(password).digest("hex")
});

UserSchema.method('verifyPassword', function(password, callback) {
  var hash=require('crypto').createHash('sha1').update(password).digest("hex");

  //
  // for security reason password hash is removed from the memory!
  // if(this.hash==="true"){
    this.model('Users').findOne({ id: this.id }).select('+hash +salt').exec(function(err,user){
      return   callback(null,hash===user.hash);
    })
  // }else{
  //   callback(null,hash===this.hash);
  // }
//  bcrypt.compare(password, this.hash, callback);
});


UserSchema.statics.authenticate=function(email, password, callback) {
  var self=this;

  return this.model('Users').findOne({ 'email.address': email }).populate('shops').exec(function(err,user){
      if (err) { return callback(err); }

      // on user is Null
      if (!user) {
        return callback("L'utilisateur ou le mot de passe est incorrect", false);
      }

      // verify passwd
      user.verifyPassword(password, function(err, passwordCorrect) {
        if (err) { return callback(err); }
        if (!passwordCorrect) { return callback(null, false); }

        //
        // keep on track login, do not use save it heat the hash
        user.logged=new Date()
        return user.save(callback)

        //
        //
        //return callback(null, user);
      });
    });
};



UserSchema.statics.register = function(email, first, last, password, confirm, extend, callback){
  // check signature
  if(callback===undefined && typeof extend==='function' )
    callback=extend;

	var Users=this.model('Users'),
      uid=email.hash(new Date());
	//error("TODO, we cannot register a user without matching a common provider (twitter, google, fb, flickr)");

	if (password !==confirm){
	  callback(("la confirmation du mot de passe n'est pas correcte"));
	  return;
	}

  // verifiy duplicity
  Users.findOne({'email.address':email}).exec(function(e,u){
    if(u){
      return callback("Cet utilisateur existe déjà")
    }

    //hash password (see virtual methods )
    //var pwd=require('crypto').createHash('sha1').update(password).digest("hex");


    /* The name of this user, suitable for display.*/
    //FIXME email.hash() should be replaced by (id++)+10000000
    // create a new customer
    var user=new Users({
        id:uid,
        displayName:first+" "+last,
        name: {
            familyName: last,
            givenName: first
        },
        email:{address:email,status:new Date()},
        provider:"local",
        password:password,
        created:new Date()
    });

    //
    // extended registration
    if(extend.phoneNumbers)
      user.phoneNumbers=extend.phoneNumbers;

    //
    // extended registration
    if(extend.addresses)
      user.addresses=extend.addresses

    //save it
    user.save(function(err){
      //FIXME manage the duplicate address ( err && err.code === 11000 )
      callback(err, user);
    });

  })
};

UserSchema.statics.updateStatus=function(id, status,callback){
	var Users=this.model('Users');


  return Users.findOne(id).populate('shops').exec(function (err, user) {
    if(err){
      return callback(err);
    }
    if(!user){
      return callback("Utilisateur inconnu");
    }

    user.status=status;
    user.updated=Date.now();
    user.save(function (err) {
      if(err){
        return callback(err)
      }
      //
      // update all shops
      require('async').forEach(user.shops, function(shop,cb){
          shop.updateStatus(status,function(err){
            cb(err)
          });
      },function(err){
        callback(err,user);
      });
    });

  });
}





//
// update user
UserSchema.statics.findAndUpdate=function(id, u,callback){
	var Users=this.model('Users');
  //http://mongoosejs.com/docs/api.html#model_Model.findByIdAndUpdate
  return Users.findOne(id).populate('shops').exec(function (err, user) {
    if(err){
      return callback(err);
    }
    if(!user){
      return callback("Utilisateur inconnu");
    }

    if (u.name&&u.name.familyName) user.name.familyName=u.name.familyName;
    if (u.name&&u.name.givenName) user.name.givenName=u.name.givenName;
    user.displayName=user.name.givenName+" "+user.name.familyName;

    //
    // check is email has changed (require a new validation)
    if (u.email&&u.email.address) {
      if (user.email.address!==u.email.address)
        user.email.status=new Date();
      user.email.address=u.email.address;

      // security check for admin? currently status is false
      //if(config.admin.emails.indexOf(user.email.address)!=-1){
      //}
    }
    //
    // update the adress
    var primary=0;
    if (u.addresses) {
      user.addresses=[]
      u.addresses.forEach(function(address){
        if(address.primary)primary++;
        user.addresses.push(address)
      });
    }

    if(primary>1){
      return callback("Il ne peut pas y avoir deux adresses principales");
    }

    //
    // update the phones
    if (u.phoneNumbers) {
      user.phoneNumbers=[]
      u.phoneNumbers.forEach(function(phone){
        user.phoneNumbers.push(phone)
      });
    }

    //
    // DO NOT update the validation here
    // ONLY ADMIN CAN DO THAT
    if(u.status!=user.status){
    }
    user.updated=Date.now();

    user.save(callback);
  });
};


//
// verify if an alias belongs to this user
UserSchema.methods.isValidAlias=function(alias, method){
  return payment.for(method).isValidAlias(alias,this, method)
}


//
// update user payment
// TODO implement update payment 
UserSchema.statics.updatePayment=function(id, alias, method,callback){
  var Users=this.model('Users');

    //
    // check if payment method as changed? 
    // if(payment.for(method.issuer).alias(id,method)!==method.alias.crypt()){
    //   return callback(new Error("Vous ne pouvez pas changer de méthode de paiement"))
    // } 

    return callback(new Error("Not implemented"))

    var result={
      issuer:method.issuer.toLowerCase(),
      name:method.name,
      number:method.number,
      expiry:method.expiry
    }
    // update user data
    return Users.update({id: id,'payments.alias':alias.crypt()}, {'$set': {
      'payments.$.issuer': result.issuer,
      'payments.$.name': result.name,
      'payments.$.number': result.number,
      'payments.$.expiry': result.expiry,
      'payments.$.updated': Date.now(),
    }}, function(err, n, stat){

      if(n===0){
        return callback("Invalid request")
      }

      return callback(err,result)
    });

}

//
// check one or more payment method
UserSchema.statics.checkPaymentMethod=function(id,alias,callback){
  var Users=this.model('Users'), promises=[];
  Users.findOne({id: id}).select('+gateway_id').exec(function(err,user){
    if(err){return callback(err)}
    if(!user){return callback("Utilisateur inconnu");}

    //
    // run promise for each alias
    alias.forEach(function (alias) {
      var p=user.getPaymentMethodByAlias(alias);
      promises.push(payment.for(p.issuer).checkCard(user,alias))
    })

    //
    // collect result
    Q.allSettled(promises).then(function (results) {
      // map result
      var ret={}
      for (var i = 0;i<results.length; i++) {
        if(results[i].state!=="fulfilled"){
          ret[alias[i]]=result.reason
        }
        // else if(i===0){
        //  ret[alias[i]]='Card prout!' 
        // }
      };
      callback(null, ret)
    })

  });
}

//
// delete user payment
UserSchema.statics.deletePayment=function(id, alias,callback){
  var Users=this.model('Users'), aliasDecrypted;
  Users.findOne({id: id}).select('+gateway_id').exec(function(err,user){
    if(err){return callback(err)}
    if(!user){return callback("Utilisateur inconnu");}
    //
    // retrieve payment method
    var p=user.getPaymentMethodByAlias(alias);
    if(!p){
      return callback("Ce mode de paiement est inconnu")
    }
    //
    // remove card
    payment.for(p.issuer).removeCard(user, alias)
    .fin(function () {
      Users.update({id: id, 'payments.alias':alias},{$pull: {payments:{alias:alias}}},{safe:true},
      function(err, n,stat){
        if(n===0){
          bus.emit('system.message',"[karibou-danger] update user after deleting payment: ",{stat:stat,user:id, alias:alias});
        }
        return callback()
      });
    })
    .fail(function(err) {
      bus.emit('system.message',"[karibou-danger] remove alias: "+err.message,{error:err,user:id, alias:alias});
      return callback(err)
    })
  });

}

//
// add payment
UserSchema.statics.addPayment=function(id, method,callback){
  var Users=this.model('Users'), safePayment={};
  Users.findOne({id: id}).select('+gateway_id').exec(function(err,user){
    if(err){return callback(err)}
    if(!user){return callback("Utilisateur inconnu");}

    if(user.checkDuplicatePaymentIssuer(method.issuer)){
      return callback("Cette méthode de paiement existe déjà");
    }
    // user has an id?
    payment.for(method.issuer).addCard(user, method).then(function (card, customer_id) {

      // for security reason alias is crypted
      safePayment.alias=card.alias;
      safePayment.issuer=card.issuer;
      safePayment.name=card.name;
      safePayment.number=card.number;
      safePayment.expiry=card.expiry;
      safePayment.provider=card.provider;
      safePayment.updated=Date.now();

      //
      // save gateway id 
      if(!user.gateway_id) user.gateway_id=customer_id;
      return user.addAndSavePayment(safePayment,callback)

    })
    .fail(function (error) {
      return callback(error)
    })
  
    

  });

}

//
//
UserSchema.methods.checkDuplicatePaymentIssuer=function  (issuer) {
  var user=this;
  if(!user.payments) return false;


  for (var i in user.payments){
    if(user.payments[i]&&user.payments[i].issuer===issuer.toLowerCase())return true;
  }

  return false;
}

//
//
UserSchema.methods.getPaymentMethodByAlias=function  (alias) {
  var user=this;
  if(!alias) return false;

  for (var i in user.payments){
    if(user.payments[i]&&user.payments[i].alias===alias)return user.payments[i];
  }

  return false;
}


//
// add and save payment method
UserSchema.methods.addAndSavePayment=function(payment,callback){
  var user=this;

  if(user.checkDuplicatePaymentIssuer(payment.issuer)){
    return callback("Cette méthode de paiement existe déjà");
  }

  if(!user.payments) user.payments=[];
  user.payments.push(payment)
  return user.save(callback)
}


/** IMPLEMENTATION FOR POSTFINANCE **/
/*
//
// add payment
UserSchema.statics.addPayment=function(id, method,callback){
  var Users=this.model('Users'), safePayment={};


  // try to build the card
  payment.postfinance.card(method,function(err, postfinance, card){
    
    if(err){
      return callback(err.message)
    }

    //
    // check if payment card changed? 
    // if((id+card.issuer.toLowerCase()).hash().crypt()!==method.alias.crypt()){
    //   return callback(new Error("Vous ne pouvez pas changer de type de carte"))
    // } 


    // for security reason alias is crypted
    var alias=(id+card.issuer.toLowerCase()).hash()
    safePayment.alias=alias.crypt();
    safePayment.issuer=card.issuer.toLowerCase();
    safePayment.name=method.name;
    safePayment.number=card.hiddenNumber;
    safePayment.expiry=card.month+'/'+(2000+card.year);
    safePayment.updated=Date.now();

    card.publish({alias:alias},function(err,res){
      if(err){
        return callback(err.message)
      }

      // save card alias
      Users.findOne({id: id}, function(err,user){
        if(err){
          // TODO alias should be removed
          return callback(err)
        }
        if(!user){
          return callback("Utilisateur inconnu");
        }

        return user.addAndSavePayment(safePayment,callback)
      });

    })

  });
}


//
// delete user payment
UserSchema.statics.deletePayment=function(id, alias,callback){
  var Users=this.model('Users'), aliasDecrypted;


  // delete
  function removeAlias(error){
    Users.update({id: id, 'payments.alias':alias.crypt()},
      {$pull: {payments:{alias:alias.crypt()}}},{safe:true},
    function(err, n,stat){

      if(n===0){
        bus.emit('system.message',"[karibou-danger] update user: ",{stat:stat,user:id, alias:alias});
      }
      return callback(error||err)
    });
  }

  try{
    payment.postfinance.card({
      alias: alias.decrypt()
    },function(err, postfinance, card){
      if(err){
        return callback(err.message)
      }
      removeAlias();
      // card.redact(function(err,result) {
      //   if(err){
      //     return callback(err.message)
      //   }
      //   return removeAlias()
      // })
    })
  }catch(err){
    // get informed about this error
    bus.emit('system.message',"[karibou-danger] remove alias: "+err.message,{error:err,user:id, alias:alias});
    return callback("Impossible de reconnaitre l'alias de votre méthode de paiement ... bizarre?'"+alias+"'")
  }

}


//
// update user payment
UserSchema.statics.updatePayment=function(id, alias, method,callback){
  var Users=this.model('Users');

  payment.postfinance.card(method,function(err, postfinance, card){
    if(err){
      return callback(err.message)
    }

    //
    // check if payment card changed? 
    if((id+card.issuer.toLowerCase()).hash().crypt()!==method.alias.crypt()){
      return callback(new Error("Vous ne pouvez pas changer de type de carte"))
    } 

    var result={
      issuer:card.issuer.toLowerCase(),
      name:card.name,
      number:card.hiddenNumber,
      expiry:card.expiry
    }
    // update user data
    return Users.update({id: id,'payments.alias':alias.crypt()}, {'$set': {
      'payments.$.issuer': result.issuer,
      'payments.$.name': result.name,
      'payments.$.number': result.number,
      'payments.$.expiry': result.expiry,
      'payments.$.updated': Date.now(),
    }}, function(err, n, stat){

      if(n===0){
        return callback("Invalid request")
      }

      return callback(err,result)
    });

  })

}

*/


UserSchema.set('autoIndex', config.mongo.ensureIndex);
module.exports = db.model('Users', UserSchema);
