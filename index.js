var port = process.env.PORT;
var ipaddress = process.env.IP; // TODO: figure out which IP to use for the heroku

var DEFAULT_PORT = port; //5000;
var DEFAULT_HOST = ipaddress; //'127.0.0.1';
var SERVER_NAME = 'super-nurse';

var mongoose = require("mongoose");
var bcrypt = require('bcrypt');
var jwt = require('jsonwebtoken');
var errs = require('restify-errors');

// Here we find an appropriate database to connect to, defaulting to
// localhost if we don't find one.  
var uristring =
    process.env.MONGODB_URI ||
    "mongodb+srv://admin:admin12@cluster0-owpuq.mongodb.net/test?retryWrites=true&w=majority";

// Makes connection asynchronously.  Mongoose will queue up database
// operations and release them when the connection is complete.
mongoose.connect(uristring, function(err, res) {
    if (err) {
        console.log('ERROR connecting to: ' + uristring + '. ' + err);
    } else {
        console.log('Successfully connected to: ' + uristring);
    }
});

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
    email: String,
    role: String,
    hash_password: String
});

userSchema.methods.comparePassword = function(password) {
    console.log("compare password called");
    return bcrypt.compareSync(password, this.hash_password);
};

// Compiles the schema into a model, opening (or creating, if
// nonexistent) the 'Patients' collection in the MongoDB database
var Patient = mongoose.model('Patient', patientSchema);
var User = mongoose.model('User', userSchema);

var restify = require('restify')
    // Create the restify server
    ,
    server = restify.createServer({ name: SERVER_NAME })

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


server.listen(process.env.PORT || 5000, function() {
    console.log('Server %s listening at %s', server.name, server.url)
    console.log('Resources:')
    console.log(' /patients')
    console.log(' /patients/:id')
    console.log(' /patients/:id/records')
    console.log(' /patients/:id/records/:id')
    console.log(' /users')
    console.log(' /auth/signin')
})


server
// Allow the use of POST
    .use(restify.plugins.fullResponse())

// Maps req.body to req.params so there is no switching between them
.use(restify.plugins.bodyParser())


server.use(function(req, res, next) {
    console.log("auth middleware")
    if (req.headers && req.headers.authorization && req.headers.authorization.split(' ')[0] === 'JWT') {
        jwt.verify(req.headers.authorization.split(' ')[1], 'Puppet', function(err, decode) {
            console.log("JWT was received")
            if (err) {
                console.log("Error verifying JWT" + err)
                req.user = undefined;
                next();
            }
            req.user = decode;
            next();
        });
    } else {
        req.user = undefined;
        next();
    }
});

var adminLevel = "Admin"
var nurseLevel = "Nurse"

function CheckUserRole(req, res, next, level) {
    if (req.user) {
        var id = req.user._id
        User.findOne({ _id: id }).exec(function(error, user) {
            if (error) {
                console.log("Find user error, error - " + error.message);
                return next(new errs.UnauthorizedError('Unauthorized user!'));
            } else if (user) {
                console.log(`email: ${user.email}, role: ${user.role}`);
                if (level === nurseLevel) {
                    if (user.role != "Admin" && user.role != "Nurse") {
                        console.log("User role not nurse or admin")
                        return next(new errs.UnauthorizedError('Unauthorized user (not Nurse or Admin)!'))
                    } else {
                        next();
                    }
                } else if (level === adminLevel) {
                    if (user.role != "Admin") {
                        console.log("User role not admin")
                        return next(new errs.UnauthorizedError('Unauthorized user (not Admin)!'))
                    } else {
                        next();
                    }
                }
            }
        })
    }

    return next(new errs.UnauthorizedError('Unauthorized user!'))
}

// Get all patients in the system
server.get('/patients',
    function(req, res, next) {
        console.log('GET request: patients');
        CheckUserRole(req, res, next, nurseLevel);
    },
    function(req, res, next) {
        console.log(` req is ${req}`)
        console.log(` res is ${res}`)

        // Find every entity within the given collection
        Patient.find({}).exec(function(error, result) {
            console.log("trying to find patients")
            if (error) return next(new errs.InvalidArgumentError(JSON.stringify(error.errors)))
            res.send(result);
        });
    })

// Get a single patient by their patient id
server.get('/hello', function(req, res, next) {
    console.log('GET request: hello/');

    res.send("Hello world");
});

// Get a single patient by their patient id
server.get('/patients/:id',
    function(req, res, next) {
        console.log('GET request: patients/' + req.params.id);
        CheckUserRole(req, res, next, nurseLevel);
    },
    function(req, res, next) {
        // Find a single patient by their id
        Patient.find({ _id: req.params.id }).exec(function(error, patient) {
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
server.post('/patients',
    function(req, res, next) {
        console.log('POST request: patients');
        CheckUserRole(req, res, next, adminLevel);
    },
    function(req, res, next) {

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
        newPatient.save(function(error, result) {

            // If there are any errors, pass them to next in the correct format
            if (error) return next(new errs.InvalidArgumentError(JSON.stringify(error.errors)))

            // Send the patient if no issues
            res.send(201, result)
        })
    })

// Delete all patients
server.del('/patients',
    function(req, res, next) {
        console.log('DEL request: patients/' + req.params.id);
        CheckUserRole(req, res, next, adminLevel);
    },
    function(req, res, next) {
        console.log('DEL request: patients/' + req.params.id);
        Patient.remove({}, function(error, result) {
            // If there are any errors, pass them to next in the correct format
            if (error) return next(new errs.InvalidArgumentError(JSON.stringify(error.errors)))

            // Send a 200 OK response
            res.send()
        });
    });

// Delete patient with the given id
server.del('/patients/:id',
    function(req, res, next) {
        console.log('DEL request: patients/' + req.params.id);
        CheckUserRole(req, res, next, adminLevel);
    },
    function(req, res, next) {
        Patient.remove({ _id: req.params.id }, function(error, result) {
            // If there are any errors, pass them to next in the correct format
            if (error) return next(new errs.InvalidArgumentError(JSON.stringify(error.errors)))

            // Send a 200 OK response
            res.send()
        });
    });

// Get all records from a single patient by their patient id
server.get('/patients/:id/records',
    function(req, res, next) {
        console.log('GET request: patients/' + req.params.id + '/records');
        CheckUserRole(req, res, next, nurseLevel);
    },
    function(req, res, next) {
        // Find a single patient by their id
        Patient.findOne({ _id: req.params.id }).exec(function(error, patient) {
            // If there are any errors, pass them to next in the correct format
            //if (error) return next(new restify.InvalidArgumentError(JSON.stringify(error.errors)))

            if (patient) {
                // Send the patient if no issues
                res.send(patient.records)
            } else {
                // Send 404 header if the patient doesn't exist
                res.send(404)
            }
        })
    });

// Add new record for the patinet with specific id
server.post('/patients/:id/records',
    function(req, res, next) {
        console.log('POST request: patients/' + req.params.id + '/records')
        CheckUserRole(req, res, next, adminLevel);
    },
    function(req, res, next) {
        Patient.findOneAndUpdate({ _id: req.params.id }).exec(function(error, patient) {
            if (patient) {
                patient.records.push({
                    date: req.body.date,
                    blood_pressure: req.body.blood_pressure,
                    respiratory_rate: req.body.respiratory_rate,
                    blood_oxygen_level: req.body.blood_oxygen_level,
                    heart_beat_rate: req.heart_beat_rate
                })
                patient.save(function(err) {
                    if (err) {
                        console.log(err);
                        return
                    }
                });
                res.send(patient)
            } else {
                // Send 404 header if the patient doesn't exist
                res.send(404)
            }
        })

    });



// Site admin section

// Get all users in the system
server.get('/users', function(req, res, next) {
    console.log('GET request: users');
    // Find every entity within the given collection
    User.find({}).exec(function(error, result) {
        if (error) return next(new errs.InvalidArgumentError(JSON.stringify(error.errors)))
        res.send(result);
    });
});

// Create a new user
server.post('/users', function(req, res, next) {
    console.log('POST request: user');

    // Make sure name is defined
    if (req.body.email === undefined) {
        // If there are any errors, pass them to next in the correct format
        return next(new errs.InvalidArgumentError('Email of new user must be supplied'))
    }
    if (req.body.password === undefined) {
        // If there are any errors, pass them to next in the correct format
        return next(new errs.InvalidArgumentError('Password of new user must be supplied'))
    }
    if (req.body.role === undefined) {
        return next(new errs.InvalidArgumentError('Role of new user must be supplied'))
    }
    console.log("New user role is " + req.body.role)
    if (req.body.role != "Admin" && req.body.role != "Nurse") {
        return next(new errs.InvalidArgumentError('Undefined role for new user'))
    }

    // Creating new user.
    var newUser = new User({
        email: req.body.email,
        role: req.body.role,
        hash_password: bcrypt.hashSync(req.body.password, 10)
    });


    // Create the user and saving to db
    newUser.save(function(error, result) {

        // If there are any errors, pass them to next in the correct format
        if (error) return next(new errs.InvalidArgumentError(JSON.stringify(error.errors)))

        // Send the user if no issues
        res.send(201, result)
    })
});

// Sign in endpoint, email and password are required
server.post('/auth/signin', function(req, res, next) {
    console.log('POST request: auth/signin');
    User.findOne({
        email: req.body.email
    }, function(err, user) {
        if (err) throw err;
        if (!user) {
            return next(new errs.UnauthorizedError('Authentication failed. User not found.'))
        } else if (user) {
            if (!user.comparePassword(req.body.password)) {
                return next(new errs.UnauthorizedError('Authentication failed. Wrong password.'))
            } else {
                var userJwt = jwt.sign({ email: user.email, _id: user._id }, 'Puppet', {
                    expiresIn: '1h'
                });

                res.send(201, { token: userJwt });
            }
        }
    });
});