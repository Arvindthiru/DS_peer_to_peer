var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var io1 = require('socket.io-client')("http://message-broker-2:3000");
var MongoClient = require('mongodb').MongoClient;
var url = "mongodb://host.docker.internal:27017/";
var pnsp = io.of('/publish');
var snsp = io.of('/subscribe');
var subscribe_url ="http://localhost:8000/subscribe";

//io1.emit("serve","hello");

app.get("/test",function(){
	console.log("Reachable I am 8000");
});

pnsp.on('connect', function(client) {

	console.log('Publisher: '+client.id+ ' connected..');

	client.on('join', function(data) {
		dbdata = {
			topic_name     : data.topic_name,
			events         : [data.event_name],
			subscribers    : []
		};
		var query = {
			topic_name     : data.topic_name
		}
		MongoClient.connect(url, function(err,db){
			if(err)
				throw err;
			var dbo = db.db("test");
			dbo.collection("pub").find(query).toArray(function(err,result){
				if(err) throw err;
				if(result.length == 0)
				{
					console.log("result not found");
					dbo.collection("pub").insertOne(dbdata, function(err, res){
					if(err)
						throw err;
					console.log("1 document inserted");
					dbo.collection("sub").find().toArray(function(err, sresult){
						if(err) throw err;
						if(sresult.length > 0)
						{
							console.log(dbdata);
							var eve = String(dbdata.topic_name);

							for( var i=0; i<sresult.length ; i++)
							{
								if(subscribe_url == sresult[i].connect_url)
								{
									console.log(sresult[i].subscriber_session);
									snsp.to(sresult[i].subscriber_session).emit("sub_connect",eve);
								}
								else
								{
									console.log("Needs to be sent to other message broker at 3000");
									var i_obj = {
										events : eve,
										session_id : sresult[i].subscriber_session
									}
									io1.emit("connect_publish",JSON.stringify(i_obj));
								}
							}
							
						}
					});
					db.close();
					});
				}
				else
				{
					var change = result[0].events;
					change.push(data.event_name);
					var newvalues = {
						$set : {
									events : change
								}
					}
					dbo.collection("pub").updateOne(query, newvalues, function(err,res){
						if(err) throw err;
						console.log("Document updated by publisher :" + client.id);
						//console.log(result);
						//db.close();
					});
					console.log(result);
					sub_length = result[0].subscribers.length
					subs = result[0].subscribers;
					if( sub_length > 0)
					{
						for(var i=0; i< sub_length ; i++)
						{
							sub_query = {
								subscriber_id : subs[i]
							}
							dbo.collection("sub").find(sub_query).toArray(function(err, sresult){
							if(err) throw err;
							console.log("check");
							session = sresult[0].subscriber_session;
							con_url = sresult[0].connect_url;
							if(con_url == subscribe_url)
							{
								n_data = {
									topic_name : result[0].topic_name,
									events : data.event_name
								}
								console.log(n_data);
								snsp.to(session).emit("sub_event",JSON.stringify(n_data));
							}
							else
							{
								console.log("Needs to be sent to other message broker");
								//console.log(con_url);
								n_data = {
									topic_name : result[0].topic_name,
									events : data.event_name,
									session_id : session
								}
								io1.emit("connect_server",JSON.stringify(n_data));
							}
							//console.log("check");
							//console.log(sresult);

							});
							//console.log(sub_query);

						}
					}
					db.close();
				}
			});
	

		});
		client.emit('messages', 'document inserted');

	});

});

snsp.on('connect', function(client ,next) {

	console.log('Subscriber :'+client.id+ ' connected..');
	console.log("Subscriber id: ", client.handshake.query.loggedsub);
	//console.log(client.handshake);
	var sub_id = client.handshake.query.loggedsub;
	var connect_url = client.handshake.query.connect_url;
	sdbdata = {
		subscriber_id : sub_id,
		subscriber_session : client.id,
		connect_url : connect_url
	}
	query = {
		subscriber_id : sub_id
	}

	MongoClient.connect(url, function(err,db){
			if(err) throw err;
			var dbo = db.db("test");
			dbo.collection("sub").find(query).toArray(function(err,result){
				if(err) throw err;
				if(result.length == 0)
				{
					console.log("subscriber not found");
					dbo.collection("sub").insertOne(sdbdata, function(err, res){
					if(err)
						throw err;
					console.log("1 subscriber document inserted");
					db.close();

					});
					dbo.collection("pub").find().toArray(function(err,result){
					if(err) throw err;
					if(result.length > 0)
					{
						for( var i=0; i<result.length ; i++)
						{
							var eve = String(result[i].topic_name);
							snsp.to(sdbdata.subscriber_session).emit("sub_connect",eve);
						}
						
					}
					});
				}
				else
				{
					console.log("update subscriber");
					var newvalues = {
						$set : {
									subscriber_session : client.id
								}
					}
					dbo.collection("sub").updateOne(query, newvalues, function(err,res){
						if(err) throw err;
						console.log("Document updated by subscriber :" + sub_id);
						db.close();
					});
					db.close();
				}
			});

	});
	client.on("SUB",function(data){

		//console.log(data);
		query = {
		topic_name : data.topic_name
		};
		MongoClient.connect(url, function(err,db){
			if(err) throw err;
			var dbo = db.db("test");
			dbo.collection("pub").find(query).toArray(function(err,result){
			if(err) throw err;
			var change = result[0].subscribers;
			//var session = result[0].subscriber_session;
			change.push(data.subscriber_no);
			var newvalues = {
				$set : {
						subscribers : change
					}
				}
			dbo.collection("pub").updateOne(query, newvalues, function(err,res){
			if(err) throw err;
			console.log("Document updated by subscriber :" + client.id);
			});
			//console.log(result);
			events = result[0].events;
			sobj = {
				topic_name : data.topic_name,
				events : result[0].events
			}
			var obj = JSON.stringify(sobj);
			//console.log(obj);
			squery = {
				subscriber_id : data.subscriber_no
			}
			dbo.collection("sub").find(squery).toArray(function(err,resul){
				if(err) throw err;
				console.log("subscriber found");
				//console.log(resul);
				console.log(obj);
				var session = resul[0].subscriber_session;
				console.log(session);
				snsp.to(session).emit("sub_event",obj);
			});
			
			db.close();

			});

		});
	});
	

  	

});

io.on('connect', function(client) {

	client.on('connect_server', function(data) {

		console.log("data received from 3000 server: "+data);
		var jdata = JSON.parse(data);
		var session = jdata.session_id;
		var n_data ={
			topic_name : jdata.topic_name,
			events : jdata.events 
		}
		snsp.to(session).emit("sub_event",JSON.stringify(n_data));
	});
	client.on('connect_publish', function(data){

		console.log("data received from 3000 server: "+data);
		var jdata = JSON.parse(data);
		var eve = jdata.events;
		var session = jdata.session_id;
		snsp.to(session).emit("sub_connect",eve);
	})

});


server.listen(8000, function(){

	console.log("Server Started..")
});

