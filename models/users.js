
var mongoose = require('mongoose')
  , Schema = mongoose.Schema
  , ObjectId = Schema.ObjectId
  , validate = require('./validate')
	, passport = require('passport');
	
//var	bcrypt = require('bcrypt');

 /* Enumerations for field validation */
 var EnumGender="homme femme".split(' ');
 var EnumProvider="twitter facebook goolge local".split(' ');


 

 // Normalized profile information conforms to the contact schema established by Portable Contacts.
 // http://portablecontacts.net/draft-spec.html#schema
 var UserSchema = new Schema({
    /* A unique identifier for the user, as generated by the service provider.  */
    id    : {type:Number, required: true, unique: true},   

    /* The provider which with the user authenticated (facebook, twitter, etc.) */
    provider: {type:String, required: true, unique: false, enum: EnumProvider}, 
    
    emails :[{
      email:{type : String, index:true, unique: false, required : false, 
        validate:[validate.email, 'invalid email address']
      },
      primary:Boolean
    }],
    
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
          value: String,
          type: String
    }],
    
    photo: String,
    
    addresses: [{
          type: { type: String, required : true, lowercase: true, trim: true },
          streetAdress: { type: String, required : true, lowercase: true, trim: true },
          locality: { type: String, required : true, lowercase: true, trim: true,
            validate:[validate.alpha, 'Invalide locality'] 
          },
          region: { type: String, required : true, lowercase: true, trim: true, default:"GE" },
          postalCode: { type: String, required : false,
            validate:[validate.postal,'Invalide postal code'] 
          },
          primary:{ type: Boolean, required : true, default:false} 
    }],
    
    /* preferred products*/
    likes: [{type: Schema.Types.ObjectId, ref : 'Products'}],
    
    /* The available Shop for this user */
    shops: [{type: Schema.Types.ObjectId, ref : 'Shops'}],
    
    
    /* */    
    invoices : {type: Schema.ObjectId, ref : 'Invoice'},
    
    /* password and creation date (for local session only)*/    
    created:{type:Date, default: Date.now},
		salt: { type: String, required: false },
		hash: { type: String, required: false },   
		roles: Array
});


/**
 * validation functions
 */
//UserSchema.path('XYZ').validate(function (value) {
//  return /male|female|homme|femme/i.test(value);
//}, 'Invalid gender');

UserSchema.statics.findOrCreate=function(u,callback){
	var Users=this.model('Users');
  Users.findOne(u, function(err, user){
    if(!user){
      var newuser=new Users(u);
      newuser.save(function(e,user){
        callback(e,user);
      });
    }else{
      callback(err, user);
    }
  });

};


UserSchema.statics.findByEmail = function(email, success, fail){
  return this.model('Users').findOne({email:email}, function(e, doc){
    if(e){
      fail(e)
    }else{
      success(doc);
    }
  });
};

UserSchema.statics.findByToken = function(token, success, fail){
  return this.model('Users').findOne({provider:token}, function(e, doc){
    if(e){
      fail(e)
    }else{
      success(doc);
    }
  });
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

UserSchema.methods.addLikes = function(product, callback){
  this.likes.push(product);
  this.save(function(err){
    if(err)callback(err);
  });
};

UserSchema.methods.removeLikes = function(product, callback){
  this.likes.pop(product);
  this.save(function(err){
    if(err)callback(err);
  });
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
//  var salt = this.salt = bcrypt.genSaltSync(10);
//  this.hash = bcrypt.hashSync(password, salt);
  this.hash = require('crypto').createHash('sha1').update(password).digest("hex")
});

UserSchema.method('verifyPassword', function(password, callback) {
  var hash=require('crypto').createHash('sha1').update(password).digest("hex");
  callback(null,hash===this.hash);  
//  bcrypt.compare(password, this.hash, callback);
});


UserSchema.statics.authenticate=function(id, password, callback) {
  
  return this.model('Users').findOne({ id: id }, function(err, user) {
      // on error
      if (err) { return callback(err); }
      

      // on user is Null
      if (!user) { return callback(null, false); }

      // verify passwd
      user.verifyPassword(password, function(err, passwordCorrect) {
        if (err) { return callback(err); }
        if (!passwordCorrect) { return callback(null, false); }
        return callback(null, user);
      });
    });
};

//
//test only
UserSchema.statics.test = function (id,password, cb){
  	var Users=this.model('Users');
  	// create a new user
    var user=new Users({
		    provider:"twitter",
		    id:id,
		    password:password,
		    photo:"https: //si0.twimg.com/profile_images/1385850059/oli-avatar-small_normal.png",
		    roles:["customer", "seller","admin"]
    });

    user.save(function(err){
      cb(err,user);
    });
};

UserSchema.statics.register = function(id, password, confirm, callback){
	var Users=this.model('Users');
	error("TODO, we cannot register a user without matching a common provider (twitter, google, fb, flickr)");
	// hash password
	//var pwd=require('crypto').createHash('md5').update(password).digest("hex");
	
	// create a new customer
	var user=new Users({
			id:id,
			provider:"twitter",
			password:password,
			created:new Date()
	});
	

	
	//save it
	user.save(function(err){
		callback(err, user);
	});
};

module.exports = mongoose.model('Users', UserSchema);



