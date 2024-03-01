const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const session = require('express-session');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;
const Cars = require('./database/cars');

const nodemailer = require('nodemailer');
require('dotenv').config();





// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/finalProjectWeb', {
    useNewUrlParser: true,
    useUnifiedTopology: true,  });
const userdb = mongoose.connection;

userdb.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

userdb.once('open', () => {
    console.log('Connected to MongoDB');
});

// Create a user schema
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    email: {type: String, unique: true},
    creationDate: { type: Date, default: Date.now },
    password: String,
    role: { type: String, default: 'user' },
    isDeleted: { type: Boolean, default: false }
});

// Create a user model
const User = mongoose.model('User', userSchema);

app.use(session({
    secret: 'se-2226',
    resave: false,
    saveUninitialized: true
}));


app.use(express.static('public'));

app.set('view engine', 'ejs');

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.get("/", function(req, res) {
    res.redirect("/signup");
});

app.use((req, res, next) => {
    req.session.language = req.session.language || 'en';
    res.locals.language = req.session.language;
    next();
});


// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    } else {
        res.redirect('/login');
    }
};

const requireAdmin = async (req, res, next) => {
    try {
        if (req.session && req.session.userId) {
            const user = await User.findById(req.session.userId);
            console.log("User role:", user.role);

            if (user && user.role === 'admin') {
                return next();
            } else {
                res.redirect('/main');
            }
        } else {
            res.redirect('/login');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Error checking user role');
    }
};
app.get("/signup", function(req, res) {
    res.render("signup");
});

app.post('/signup', async (req, res) => {
    const { username, password, email, role } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            username: username,
            email: email,
            password: hashedPassword,
            role: role || 'user',
        });

        // Save the user to the database
        await newUser.save();



        const transporter = nodemailer.createTransport({
            host:"smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
                // Use environment variables instead of hard-coded values
                user: process.env.MAIL_USERNAME,
                pass: process.env.MAIL_PASSWORD,
            }
        });

        const mailOptions = {
            from: process.env.MAIL_USERNAME,
            to: email,
            subject: "Welcome",
            // Use html instead of text to send an html email
            html: `
                    <p>Welcome to the community of car lovers</p>
                    <img src="cid:logo" alt="Logo" width="1200" height="800">`,
            // Attach the image and reference it by content id
            attachments: [{
                filename: 'logo.png',
                path: './BMW_M1,_front_right_(Brooklyn).jpg',
                cid: 'logo'
            }]
        };

        transporter.sendMail(mailOptions, (err, info) => {
            // Use error handling to display the result
            if (err) {
                console.error('Error sending email: ' + err.message);
            } else {
                console.log('Email sent: ' + info.response);
            }
        });

        res.send('Registration successful!');


    } catch (error) {
        console.error(error);
        res.send('Error in registration.');
    }
});


app.get('/admin', requireAuth, requireAdmin, async (req, res) => {
    try {
        // Fetch available books from the database
        const books = await Cars.find();
        const user = await User.findById(req.session.userId);
        const users = await User.find({ role: { $ne: 'admin' } });


        res.render('admin', {users: users, books: books,  username: user.username });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching books data');
    }
});


app.get('/deleteuser/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const userToDelete = await User.findById(req.params.id);

        if (userToDelete.role === 'admin') {
            return res.status(403).send('Cannot delete admin user');
        }

        const result = await User.findByIdAndDelete(req.params.id);

        if (!result) {
            return res.status(404).send('User not found');
        }


        res.redirect('/admin');
    } catch (error) {
        console.error(error);
        res.status(500).send(`Error deleting user: ${error.message}`);
    }
});


app.get('/main', requireAuth, async (req, res) => {
    try {

        const user = await User.findById(req.session.userId);

        // Fetch available books from the database
        const books = await Cars.find();


        const googleBooksData = await fetchBookDataFromGoogleBooks('your query here');



        res.render('main', { username: user.username, books: books, googleBooksData: googleBooksData });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching user data');
    }
});

app.get('/login', (req, res) => {
    res.render('login');
});

// Handle user login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).send('Invalid username or password');
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (passwordMatch) {
            req.session.userId = user._id;
            req.session.language = req.body.language
            requireAdmin(req, res, () => {
                res.redirect('/admin');
            });
        } else {
            return res.status(401).send('Invalid username or password');
        }
    } catch (error) {
        console.error(error);
        return res.status(500).send('Error during login.');
    }
});


app.post('/addcar', async (req, res) => {
    const { title, author, genre } = req.body;

    const newCar = new Cars({
        title: title,
        author: author,
        genre: genre,
    });

    try {
        await newCar.save();
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error saving car to the database');
    }
});


app.get('/deletebook/:id', async (req, res) => {
    try {
        const result = await Cars.deleteOne({ _id: req.params.id });

        if (result.deletedCount === 0) {
            // Book with the given ID does not exist
            return res.status(404).send('Book not found');
        }

        res.redirect('/admin');
    } catch (error) {
        console.error(error);
        res.status(500).send(`Error deleting book: ${error.message}`);
    }
});


app.get('/getbook/:id', async (req, res) => {
    try {
        const book = await Cars.findById(req.params.id);
        res.json(book);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching book details');
    }
});


app.post('/updatebook/:id', async (req, res) => {
    const { title, author, genre } = req.body;

    try {
        const updatedBook = await Cars.findByIdAndUpdate(
            req.params.id,
            { title, author, genre },
            { new: true }
        );

        if (!updatedBook) {
            return res.status(404).send('Book not found');
        }

        res.redirect('/admin');
    } catch (error) {
        console.error(error);
        res.status(500).send(`Error updating book: ${error.message}`);
    }
});

app.get("/chuck", async (req, res) => {
    const chuckCitation = await fetch("https://api.chucknorris.io/jokes/random", {method: "GET"})
        .then(res => {return res.json()})
        .catch(err => {console.log(err)})
    res.render("chuck", {chuckCitation})
})

app.get("/astro", async (req, res) => {
    const astroPicture = await fetch("https://api.nasa.gov/planetary/apod?api_key=gqbgRCTKRW3hR19ZrD5zpxUuBefXrp9ZfPoj59GV", {method: "GET"})
        .then(res => {return res.json()})
        .catch(err => {console.log(err)})
    console.log(astroPicture)
    res.render("astro", {astroPicture})
})

// GOOGLE BOOKS API
async function fetchBookDataFromGoogleBooks(query) {
    try {
        const response = await axios.get('https://www.googleapis.com/books/v1/volumes', {
            params: {
                q: query,
            },
        });

        return response.data.items;
    } catch (error) {
        console.error('Error fetching book data from Google Books API:', error.message);
        throw error;
    }
}

app.post('/setLanguage', (req, res) => {
    const { language } = req.body;
    req.session.language = language;
    res.redirect('/login');
});




app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});