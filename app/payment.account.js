var util = require("util");
var events = require("events");
var bus = require('../app/bus');
var Q=require('q');
var bank = require("karibou-wallet")();


function parseError(err, handleAccount,order,user) {

	//
	// get an email on error
	var context={wallet:handleAccount};

	if(user){
		context.email=user.email;		
	}
	if(order){
		context.email=order.email;
		context.oid=order.oid;
	}
  bus.emit('system.message',"[karibou-wallet] karibou error: ",{message:err.message,type:err.type, context:context});

	return err;
}


var PaymentAccount=function(_super){
	this.bank=bank;
	this._super=_super;
}


//
// verify if an alias is valid and belongs to the user
PaymentAccount.prototype.isValidAlias=function(alias, user){
	try{
		var elems=alias.decrypt().split(':')
		return(elems.length===3 && elems[0]===user.id+'')
	}catch(e){
		return false;
	}
}

//
// verify if an alias is valid and decode it
PaymentAccount.prototype.decodeAlias=function(alias, user){
	try{
		var elems=alias.decrypt().split(':')
		if(elems[0]!==(user.id+'')) return false;
		return {id:elems[0],last4:elems[1],wallet_id:elems[2]}
	}catch(e){
		return false;
	}
}

//
// check if method fields are ok
PaymentAccount.prototype.isPaymentObjectValid=function(payment){
  return (payment&&payment.alias&&payment.issuer&&payment.number);
}

PaymentAccount.prototype.alias=function(user_id,last4,wallet_id){
	//
  return (user_id+':'+last4+':'+wallet_id).crypt()  
}




//
// check karibou customer
PaymentAccount.prototype.checkCard=function(user,alias){
	var deferred = Q.defer(), karibouPromise, self=this, result={};


	//
	// check alias
	var handleAccount=this.decodeAlias(alias,user);
	if(!handleAccount){
    return Q.reject(new Error("La référence de la carte n'est pas compatible avec le service de paiement"))
	}


	//
	// check card binding
	bank.wallet.retrieve(handleAccount.wallet_id)
		.then(function(wallet) {
			if(wallet.balance<=500){
		    return deferred.reject(new Error("Le montant sur votre compte est insuffisant !"));				
			}
	    deferred.resolve(wallet);
	  })
	  .then(undefined,function (err) {
	    deferred.reject(parseError(err,handleAccount,0,user));
	  });

	// return promise
	return deferred.promise;

}


//
// validate a card or alias and get new Wallet by callback
PaymentAccount.prototype.removeCard=function(user, alias){
	var self=this;
	var _removeCard=function (deferred, callback) {
		//
		// check alias
		var handleAccount=self.decodeAlias(alias,user);
		if(!handleAccount){
	    return Q.reject(new Error("La référence de la carte n'est pas compatible avec le service de paiement"))
		}

    return Q.reject(new Error("Le compte client ne peut pas être supprimé"))

	}

	return this._super.removeCard(_removeCard,user,alias)
}

//
// validate a card or alias and get new Card by callback
PaymentAccount.prototype.addCard=function(user, payment){
	var karibouPromise, self=this, result={};


	var _addCard=function (deferred, callback) {

		if(user.email.status!==true){
	    return Q.reject(new Error("Impossible d'enregistrer une carte avec un compte non validé"))
		}

	  bank.wallet.create({
	    id:user.id,
	    email:user.email.address,
	    card:{name:user.display()},
	    description:'Votre compte privé'	  	
	  }).then(function (wallet) {

    	result={
    		alias:self.alias(user.id,wallet.card.last4,wallet.id),
    		number:'xxxx-xxxx-xxxx-'+wallet.card.last4,
    		issuer:'wallet',
    		name:wallet.card.name,
    		expiry:wallet.card.expiry,
    		updated:Date.now(),
    		provider:'wallet'
    	};
	    return callback(result, wallet);
	  }).then(undefined,function (error) {
	    callback(parseError(error,0,0,user));
		});

		return deferred.promise;
	}

	// return promise
	return this._super.addCard(_addCard, user,payment);
}

//
// simple charge wrapper
PaymentAccount.prototype.charge=function (options,alias,user) {
  var self=this;
  var _charge=function (deferred, callback) {

    // check alias, in this case the order status is affected
    var handleAccount=self.decodeAlias(alias,user);
    if(!handleAccount){
      return Q.reject(new Error("La référence de la carte n'est pas compatible avec le service de paiement"));
    }

		bank.charge.create(handleAccount.wallet_id,{
		  amount: Math.round(options.amount*100),
		  captured:true, /// ULTRA IMPORTANT HERE!
		  description: options.description
		}).then(function(charge,wallet) {

	  	var result={
	  		log:'captured amount '+(charge.amount/100)+' the '+new Date(charge.created).toDateString(),
	  		transaction:charge.id.crypt(),
	  		updated:Date.now(),
	  		provider:'wallet'
	  	};
	  	//
	  	// return result
 		  bus.emit('activity.update',user,{type:'Wallets',key:'wid',id:handleAccount.wallet_id},
 		  		{transaction:charge.amount/100,balance:wallet.balance/100,what:'charge'});

			callback(null,result,wallet);
		}).then(undefined,function (err) {
			callback(parseError(err,handleAccount,0,user));
		})	  

		return deferred.promise;
  }

  // return promise
  return this._super.charge(_charge, options);
}


//
// authorize a new payment for this order
PaymentAccount.prototype.authorize=function(order){
	var self=this;
  var _authorize=function (deferred, callback) {
		//
		// check alias
		var handleAccount=self.decodeAlias(order.payment.alias,order.customer);
		if(!handleAccount){
      setTimeout(function() {
        callback(new Error("La référence de la carte n'est pas compatible avec le service de paiement"));
      }, 0);
      return deferred.promise;
		}

		bank.charge.create(handleAccount.wallet_id,{
		  amount: Math.round(order.getTotalPrice(config.payment.reserve)*100),
		  currency: "CHF",
		  capture:false, /// ULTRA IMPORTANT HERE!
		  description: "#"+order.oid+" for "+order.customer.email.address
		}).then(function(charge,wallet) {

	  	var result={
	  		log:'authorized amount '+(charge.amount/100)+' the '+new Date(charge.created).toDateString(),
	  		transaction:charge.id.crypt(),
	  		updated:Date.now(),
	  		provider:'wallet'
	  	};

	  	// log
 		  bus.emit('activity.update',order.customer,{type:'Wallets',key:'wid',id:handleAccount.wallet_id},
 		  		{transaction:charge.amount/100,balance:wallet.balance/100,what:'authorize'});

	  	//
	  	// return result
			callback(null,result)
		}).then(undefined,function (err) {
			callback(parseError(err,handleAccount,order));
		})	  

		// return a promise
		return deferred.promise;
	}	

	// return promise
	return this._super.authorize(_authorize, order);
}

//
// cancel  an authorization for this order
PaymentAccount.prototype.cancel=function(order,reason){
	var self=this;
  var _cancel=function (deferred, callback) {

  	//
  	// for capture, cancel and refund the order status is not changed
		var handleAccount=self.decodeAlias(order.payment.alias,order.customer);
		if(!handleAccount){
      setTimeout(function() {
        callback(new Error("La référence de la carte n'est pas compatible avec le service de paiement"));
      }, 0);
      return deferred.promise;
		}

	  if(!order.payment.transaction){
	  	return Q.reject(new Error('Aucune transaction est attachée à votre commande'))
	  }

		bank.charge.cancel(handleAccount.wallet_id,{
			id:order.payment.transaction.decrypt()
		})
		.then(function(refund,wallet) {
	  	var result={
	  		log:'cancel authorization the '+new Date().toDateString(),
	  		updated:Date.now(),
	  		provider:'wallet'
	  	};

 		  bus.emit('activity.update',order.customer,{type:'Wallets',key:'wid',id:handleAccount.wallet_id},
 		  		{transaction:refund.amount/100,balance:wallet.balance/100,what:'cancel'});

			callback(null,result)
		}).then(undefined,function (err) {
			callback(parseError(err,handleAccount,order));
		})

		return deferred.promise;
  }

	// return promise
	return this._super.cancel(_cancel,order,reason)
}

//
// refund this order
PaymentAccount.prototype.refund=function(order,reason, amount){
	var self=this;
  //
  // create full refund 
	var _refund=function (deferred, callback) {

  	//
  	// for capture, cancel and refund the order status is not changed
		var handleAccount=self.decodeAlias(order.payment.alias,order.customer);
		if(!handleAccount){
      setTimeout(function() {
        callback(new Error("La référence de la carte n'est pas compatible avec le service de paiement"));
      }, 0);
      return deferred.promise;
		}

	  if(!order.payment.transaction){
	  	return Q.reject(new Error('Aucune transaction est attachée à votre commande'))
	  }

		bank.charge.refund(handleAccount.wallet_id,{
			id:order.payment.transaction.decrypt(),
			amount:amount&&Math.round(amount*100)
		}).then(function(refund,wallet) {


	  	var result={
	  		log:'refund '+refund.amount/100+' the '+new Date().toDateString(),
	  		transaction:refund.id.crypt(),
	  		updated:Date.now(),
	  		provider:'wallet'
	  	};

 		  bus.emit('activity.update',order.customer,{type:'Wallets',key:'wid',id:handleAccount.wallet_id},
 		  		{transaction:refund.amount/100,balance:wallet.balance/100,what:'refund'});

			callback(null,result);
	  }).then(undefined,function (err) {
			callback(parseError(err,handleAccount,order))
	  })

		return deferred.promise;
	}

	return this._super.refund(_refund,order,reason,amount)

}

//
// capture this authorized order
PaymentAccount.prototype.capture=function(order,reason){
	var self=this;
	var _capture=function (deferred, callback) {

  	//
  	// for capture, cancel and refund the order status is not changed
		var handleAccount=self.decodeAlias(order.payment.alias,order.customer);
		if(!handleAccount){
      setTimeout(function() {
        callback(new Error("La référence de la carte n'est pas compatible avec le service de paiement"));
      }, 0);
      return deferred.promise;
		}

	  if(!order.payment.transaction){
	  	return Q.reject(new Error('Aucune transaction est attachée à votre commande'))
	  }

		bank.charge.capture(handleAccount.wallet_id,{
			id:order.payment.transaction.decrypt(),
			amount:Math.round(order.getTotalPrice()*100)
		}).then(function(charge,wallet) {
	  	var result={
	  		log:'capture '+charge.amount/100+' the '+new Date().toDateString(),
	  		transaction:charge.id.crypt(),
	  		updated:Date.now(),
	  		provider:'wallet'
	  	};

 		  bus.emit('activity.update',order.customer,{type:'Wallets',key:'wid',id:handleAccount.wallet_id},
 		  		{transaction:charge.amount/100,balance:wallet.balance/100,what:'capture'});

			callback(null,result)
		}).then(undefined,function (err) {
			callback(parseError(err,handleAccount,order))
		})

		return deferred.promise;
	}

	return this._super.capture(_capture,order,reason)

}


module.exports=function(_super){
	return new PaymentAccount(_super)
};
