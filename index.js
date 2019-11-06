var DEFAULT_PORT = 5000
var DEFAULT_HOST = '127.0.0.1'
var SERVER_NAME = 'healthrecords'

var http = require ('http');
var mongoose = require ("mongoose");

var port = process.env.PORT;
var ipaddress = process.env.IP; // TODO: figure out which IP to use for the heroku

// Here we find an appropriate database to connect to, defaulting to
// localhost if we don't find one.  
var uristring = 
  process.env.MONGODB_URI || 
  'mongodb://localhost/e-health-db';

// Makes connection asynchronously.  Mongoose will queue up database
// operations and release them when the connection is complete.
mongoose.connect(uristring, function (err, res) {
  if (err) { 
    console.log ('ERROR connecting to: ' + uristring + '. ' + err);
  } else {
    console.log ('Successfully connected to: ' + uristring);
  }
});

// This is the schema.  Note the types, validation and trim
// statements.  They enforce useful constraints on the data.
var recordSchema = new mongoose.Schema({
  date: String,
  blood_pressure: String,
  respiratory_rate: String,
  blood_oxygen_level: String,
  heart_beat_rate: String
});

var patientSchema = new mongoose.Schema({
  first_name: String, 
  last_name: String,
  height: Number,
  weight: Number,
  date_of_birth: String,
  floor: String,
  records: [recordSchema]
});

var userSchema = new mongoose.Schema({
  username: String,
  password: String
});

// Compiles the schema into a model, opening (or creating, if
// nonexistent) the 'Patients' collection in the MongoDB database
var Patient = mongoose.model('Patient', patientSchema);
var User = mongoose.model('User', userSchema);

var errs = require('restify-errors');

var restify = require('restify')
  // Create the restify server
  , server = restify.createServer({ name: SERVER_NAME})

	if (typeof ipaddress === "undefined") {
		//  Log errors on OpenShift but continue w/ 127.0.0.1 - this
		//  allows us to run/test the app locally.
		console.warn('No process.env.IP var, using default: ' + DEFAULT_HOST);
		ipaddress = DEFAULT_HOST;
	};

	if (typeof port === "undefined") {
		console.warn('No process.env.PORT var, using default port: ' + DEFAULT_PORT);
		port = DEFAULT_PORT;
	};
  
  
  server.listen(port, ipaddress, function () {
  console.log('Server %s listening at %s', server.name, server.url)
  console.log('Resources:')
  console.log(' /patients')
  console.log(' /patients/:id')
  console.log(' /patients/:id/records')
  console.log(' /patients/:id/records/:id')
  console.log(' /users')
})


  server
    // Allow the use of POST
    .use(restify.plugins.fullResponse())

    // Maps req.body to req.params so there is no switching between them
    .use(restify.plugins.bodyParser())

  // Get all patients in the system
  server.get('/patients', function (req, res, next) {
    console.log('GET request: patients');
    // Find every entity within the given collection
    Patient.find({}).exec(function (error, result) {
      if (error) return next(new errs.InvalidArgumentError(JSON.stringify(error.errors)))
      res.send(result);
    });
  })


  // Get a single patient by their patient id
  server.get('/patients/:id', function (req, res, next) {
    console.log('GET request: patients/' + req.params.id);

    // Find a single patient by their id
    Patient.find({ _id: req.params.id }).exec(function (error, patient) {
      // If there are any errors, pass them to next in the correct format
      //if (error) return next(new restify.InvalidArgumentError(JSON.stringify(error.errors)))

      if (patient) {
        // Send the patient if no issues
        res.send(patient)
      } else {
        // Send 404 header if the patient doesn't exist
        res.send(404)
      }
    })
  })


  // Create a new patient
  server.post('/patients', function (req, res, next) {
    console.log('POST request: patients');
    // Make sure name is defined
    if (req.body.first_name === undefined) {
      // If there are any errors, pass them to next in the correct format
      return next(new errs.InvalidArgumentError('first_name must be supplied'))
    }
    if (req.body.last_name === undefined) {
      // If there are any errors, pass them to next in the correct format
      return next(new errs.InvalidArgumentError('last_name must be supplied'))
    }

    // Creating new patient.
    var newPatient = new Patient({
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      height: req.body.height,
      weight: req.body.weight,
      date_of_birth: req.body.date_of_birth,
      floor: req.body.floor
    });


    // Create the patient and saving to db
    newPatient.save(function (error, result) {

      // If there are any errors, pass them to next in the correct format
      if (error) return next(new errs.InvalidArgumentError(JSON.stringify(error.errors)))

      // Send the patient if no issues
      res.send(201, result)
    })
  })

  // Delete all patients
  server.del('/patients', function (req, res, next) {
    console.log('DEL request: patients/' + req.params.id);
    Patient.remove({}, function (error, result) {
      // If there are any errors, pass them to next in the correct format
      if (error) return next(new errs.InvalidArgumentError(JSON.stringify(error.errors)))

      // Send a 200 OK response
      res.send()
    });
  })

  // Delete patient with the given id
  server.del('/patients/:id', function (req, res, next) {
    console.log('DEL request: patients');
    Patient.remove({ _id: req.params.id }, function (error, result) {
      // If there are any errors, pass them to next in the correct format
      if (error) return next(new errs.InvalidArgumentError(JSON.stringify(error.errors)))

      // Send a 200 OK response
      res.send()
    });
  })

  // Get all records from a single patient by their patient id
  server.get('/patients/:id/records', function (req, res, next) {
    console.log('GET request: patients/' + req.params.id + '/records');

    // Find a single patient by their id
    Patient.find({ _id: req.params.id }).exec(function (error, patient) {
      // If there are any errors, pass them to next in the correct format
      //if (error) return next(new restify.InvalidArgumentError(JSON.stringify(error.errors)))

      if (patient) {
        // Send the patient if no issues
        res.send(patient[0].records)
      } else {
        // Send 404 header if the patient doesn't exist
        res.send(404)
      }
    })
  })

  server.post('/patients/:id/records', function (req, res, next) {
    console.log('POST request: patients/' + req.params.id + '/records')

    Patient.findOneAndUpdate({ _id: req.params.id }).exec(function (error, patient) {
      if (patient) {
        patient.records.push({
          date: req.body.date,
          blood_pressure: req.body.blood_pressure,
          respiratory_rate: req.body.respiratory_rate,
          blood_oxygen_level: req.body.blood_oxygen_level,
          heart_beat_rate: req.heart_beat_rate
        })
        patient.save(function (err) {
          if (err) {
            console.log(err)
            return
          }
        })
        res.send(patient)
      } else {
        // Send 404 header if the patient doesn't exist
        res.send(404)
      }
    })

  })

  // Create a new patient
  server.post('/users', function (req, res, next) {
    console.log('POST request: user');

    // Make sure name is defined
    if (req.body.username === undefined) {
      // If there are any errors, pass them to next in the correct format
      return next(new errs.InvalidArgumentError('username must be supplied'))
    }
    if (req.body.password === undefined) {
      // If there are any errors, pass them to next in the correct format
      return next(new errs.InvalidArgumentError('password must be supplied'))
    }

    // Creating new user.
    var newUser = new User({
      username: req.body.username,
      password: req.body.password
    });


    // Create the user and saving to db
    newUser.save(function (error, result) {

      // If there are any errors, pass them to next in the correct format
      if (error) return next(new errs.InvalidArgumentError(JSON.stringify(error.errors)))

      // Send the user if no issues
      res.send(201, result)
    })
  })