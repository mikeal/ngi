var http = require("http"),
    sys = require("sys"),
    url = require("url");
    
var Connection = function () {
  process.EventEmitter.call(this);
};
sys.inherits(Connection, process.EventEmitter);

var Request = function (httpRequest, environ) {
  process.EventEmitter.call(this);
  this.environ = environ;
  this.appDone = false;
  this.chunks = [];
  httpRequest.addListener("body", this.bodyListener);
  httpRequest.addListener("complete", this.completeListener);
};
sys.inherits(Request, process.EventEmitter);
Request.prototype.bodyListener = function (chunk) {
  this.chunk = chunk;
  this.emit("body", chunk);
};
Request.prototype.completeListener = function () {
  this.emit("done");
};

var Response = function (httpResponse) {
  process.EventEmitter.call(this);
  this.headers = [];
  this.httpResponse = httpResponse;
  this.headersSent = false;
};
sys.inherits(Response, process.EventEmitter);
Response.prototype.start = function (status) {
  this.status = status;
  this.emit("start", this);
  var startPromise = new process.Promise();
  var sendPromise = this.httpResponse.sendHeader(this.status, this.headers);
  sendPromise.addCallback(function () {
    this.headersSent = true;
    startPromise.emitSuccess();
  });
  sendPromise.addErrback(function () {
    startPromise.emitError();
  }); 
  return startPromise;
};
Response.prototype.sendBody = function (chunk) {
  if (!this.headersSent) {
    throw "Response.sendBody called before headers were sent.";
  }
  this.chunk = chunk;
  this.emit("body", this);
  var myPromise = new process.Promise();
  var sendPromise = this.httpResponse.sendBody(chunk);
  sendPromise.addCallback(function () {
    myPromise.emitSuccess();
  });
  sendPromise.addErrback(function () {
    myPromise.emitError();
  });
  return myPromise;
};
Response.prototype.end = function () {
  this.emit("end", this);
  var endPromise = new process.Promise();
  var finishPromise = this.httpResponse.finish();
  finishPromise.addCallback(function () {
    endPromise.emitSuccess();
  });
  finishPromise.addErrback(function () {
    endPromise.emitError();
  });
};


var Server = function (application, port, host) {
  this.application = application;
  this.host = host;
  this.port = port;
};
Server.prototype.start = function () {
  var s = this;
  var httpRequestListener = function (httpRequest, httpResponse) {
    var uri = url.parse(httpRequest.url, true);
    var headers = [];
    for (headerName in httpRequest.headers) {
      headers.push([headerName, httpRequest.headers[headerName]]);
    }
    var protocol = parseFloat(httpRequest.httpVersion);
    var environ = { request_method  : httpRequest.method,
                    full_path       : httpRequest.url,
                    query           : uri.query,
                    path            : uri.pathname,
                    content_type    : httpRequest.headers['content-type'],
                    content_length  : httpRequest.headers['content-length'],
                    headers         : headers,
                    protocol        : protocol,
                    server_protocol : protocol
                  };
    var request = new Request(httpRequest, environ);
    var response = new Response(httpResponse);

    s.application(undefined, request, response);
  };
  this.httpServer = http.createServer(httpRequestListener);
  this.httpServer.listen(this.port, this.host);
};


var testApplication = function (connection, request, response) {
  response.headers.push(['content-type','text/plain'])
  response.start(200);
  response.sendBody('Hello World!');
  response.end();
};

var s = new Server(testApplication, 8080);
s.start()


