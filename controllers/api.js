
/*
 * API introspection
 */
var _ = require('underscore'),
    bus=require('../app/bus'),
    sm = require('sitemap'),
    errorHelper = require('mongoose-error-helper').errorHelper;
    origins=[]

//
// authorized origins
function btoa(str){
  return new Buffer(str).toString('base64')
}

config.cors.allowedDomains.forEach(function(origin){
  origins.push(btoa(origin))
})

exports.index = function(app){
  return function(req, res) {
    var model={ 
      api: app.routes, 
      user: req.user, 
      filter:function(api){
        return _.filter(api, function(route){return route.path.indexOf("/v1")>-1;});
      } 
    };
    res.render('home',  model);
  }
};




exports.config = function(req, res) {
    //
    // admin you get server env
    if (req.user&&req.user.isAdmin()) { 
      config.shop.env=process.env;
    }
    res.json(config.shop);
};



exports.trace = function(req, res) {
    if(origins.indexOf(req.params.key)==-1){
      return res.send(401,"invalid token")
    }
    bus.emit('trace.error',req.params.key,req.body);

    if(req.body.stacktrace&&req.body.stacktrace.frames.length){
      var len=req.body.stacktrace.frames.length
      console.log("ERROR[UI]",
        req.body.message,
        req.body.request.headers, 
        req.body.request.url, 
        req.body.site, 
        req.body.stacktrace.frames[len-1].pre_context)
    }
    res.json({});
};


exports.message = function(req, res) {
    if(origins.indexOf(req.params.key)==-1){
      // return res.send(401,"invalid token")
    }
    bus.emit('system.message',"[kariboo-subscribe] : ",req.body);

    res.json({});
};



exports.sessions = function(req, res) {
  require('mongoose').connection.db.collection('sessions',function(err,sessions){
    if(err){
      return res.send(400,errorHelper(err))
    }
    sessions.find({}).toArray(function(err,sess){
      if(err){
        return res.send(400,errorHelper(err))
      }
      return res.json(sess)
    })
  })
}

exports.sitemap=function(req,res){
  var sitemap;

  // if sitemap is cached
  if (sitemap && sitemap.isCacheValid()){
    return sitemap.toXML( function (xml) {
        res.header('Content-Type', 'application/xml');
        res.send( xml );
    });    
  }

  // else
  require('mongoose').model('Products').findByCriteria({'query.status':true},function(err,products){
    if(err){
      return req.send(400,errorHelper(err))
    }
    var prefix="/products/";
    var urls=[];
    products.forEach(function(product){
      // use lastmod wit product update date ??
      urls.push({url:prefix+product.sku, changefreq: 'weekly', priority: 1.0 })
    })

    sitemap = sm.createSitemap ({
      hostname: config.mail.origin,
      cacheTime: (12*3600000),        // 12h - cache purge period
      urls: urls
    });

    sitemap.toXML( function (xml) {
        res.header('Content-Type', 'application/xml');
        res.send( xml );
    });    

  })
}

exports.robots=function(req,res){
  res.type('text/plain');
  res.send(200,'User-agent: *\nDisallow: /\n');
}


exports.github=function(req,res){
  var spawn = require('child_process').spawn;

  function verify(key, body) {
    var str=JSON.stringify(body);
    return 'sha1=' + require('crypto').createHmac('sha1', key).update(str).digest('hex')
  }


  //
  // checks github config 
  if(!config.admin.github||!config.admin.github.secret){
    return res.send(400)
  }

  //
  // checks push release
  if(req.body.ref.indexOf(config.admin.github.release)===-1){
    return res.send(400)    
  }

  //
  // checks github posting params
  var  sig   = req.headers['x-hub-signature']
      ,event = req.headers['x-github-event']
      ,id    = req.headers['x-github-delivery']  
      ,verify= verify(config.admin.github.secret,req.body)


  if(!sig||!event||!id){
    return res.send(400)
  }

  if(sig!==verify){
    console.log('gihub sig verification error',sig,verify)
    return res.send(400,'sig verification error')
  }

  if (req.body.ref.indexOf(config.admin.github.release)===-1) {
    return res.send(200)
  }

  var child=spawn('node-continuous.sh',[config.admin.github.release,config.express.port],{detached:true})
  child.stdout.on('data', function (stdout) {
    console.log("github",event,stdout.toString('utf8'))    
  })

  child.stderr.on('data', function (error) {
    console.log(error.toString('utf8'))
    //return bus.emit('system.message',"[karibou-github error] : ",error.toString('utf8'));
  });
}