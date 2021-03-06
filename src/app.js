// solution https://github.com/LambdaSchool/Secret-Gists/blob/async/src/app.js
require('dotenv').config();
const fs = require('fs');
const bodyParser = require('body-parser');
const express = require('express');
const octokit = require('@octokit/rest');
const nacl = require('tweetnacl');
nacl.util = require('tweetnacl-util');

const username = 'fmarkwong'; // TODO: Replace with your username
const github = octokit({ debug: true });
const server = express();

// Create application/x-www-form-urlencoded parser
const urlencodedParser = bodyParser.urlencoded({ extended: false });

let mySecretKeyString = process.env.SECRET_KEY;

// Generate an access token: https://github.com/settings/tokens
// Set it to be able to create gists
github.authenticate({
  type: 'oauth',
  token: process.env.GITHUB_TOKEN
});

// TODO:  Attempt to load the key from config.json.  If it is not found, create a new 32 byte key.

const asyncHandler = fn => (req, res, next) => fn(req, res, next).catch(next);

server.get('/', (req, res) => {
  // Return a response that documents the other routes/operations available
  res.send(`
    <html>
      <header><title>Secret Gists!</title></header>
      <body>
        <h1>Secret Gists!</h1>
        <div>This is an educational implementation.  Do not use for truly valuable information</div>
        <h2>Supported operations:</h2>
        <ul>
          <li><i><a href="/keyPairGen">Show Keypair</a></i>: generate a keypair from your secret key.  Share your public key for other users of this app to leave encrypted gists that only you can decode with your secret key.</li>
          <li><i><a href="/gists">GET /gists</a></i>: retrieve a list of gists for the authorized user (including private gists)</li>
          <li><i><a href="/key">GET /key</a></i>: return the secret key used for encryption of secret gists</li>
        </ul>
        <h3>Set your secret key to a specific key</h3>
        <form action="/setkey:keyString" method="get">
          Key String: <input type="text" name="keyString"><br>
          <input type="submit" value="Submit">
        </form>
        <h3>Create an *unencrypted* gist</h3>
        <form action="/create" method="post">
          Name: <input type="text" name="name"><br>
          Content:<br><textarea name="content" cols="80" rows="10"></textarea><br>
          <input type="submit" value="Submit">
        </form>
        <h3>Create an *encrypted* gist for yourself</h3>
        <form action="/createsecret" method="post">
          Name: <input type="text" name="name"><br>
          Content:<br><textarea name="content" cols="80" rows="10"></textarea><br>
          <input type="submit" value="Submit">
        </form>
        <h3>Retrieve an *encrypted* gist you posted for yourself</h3>
        <form action="/fetchmessagefromself:id" method="get">
          Gist ID: <input type="text" name="id"><br>
          <input type="submit" value="Submit">
        </form>
        <h3>Create an *encrypted* gist for a friend to decode</h3>
        <form action="/postmessageforfriend" method="post">
          Name: <input type="text" name="name"><br>
          Friend's Public Key String: <input type="text" name="publicKeyString"><br>
          Content:<br><textarea name="content" cols="80" rows="10"></textarea><br>
          <input type="submit" value="Submit">
        </form>
        <h3>Retrieve an *encrypted* gist a friend has posted</h3>
        <form action="/fetchmessagefromfriend:messageString" method="get">
          String From Friend: <input type="text" name="messageString"><br>
          <input type="submit" value="Submit">
        </form>
      </body>
    </html>
  `);
});

// server.get('/api/notes', asyncHandler(async (req, res) => {
//   const response = await Note.find()
//   res.status(200).json(response);
// }));

server.get('/keyPairGen', asyncHandler(async (req, res) => {
  // TODO:  Generate a keypair from the secretKey and display both
  const keypair = await nacl.box.keyPair();

  // Display both keys as strings
  res.send(`
  <html>
    <header><title>Keypair</title></header>
    <body>
      <h1>Keypair</h1>
      <div>Share your public key with anyone you want to be able to leave you secret messages.</div>
      <div>Keep your secret key safe.  You will need it to decode messages.  Protect it like a passphrase!</div>
      <br/>
      <div>Public Key: ${nacl.util.encodeBase64(keypair.publicKey)}</div>
      <div>Secret Key: ${nacl.util.encodeBase64(keypair.secretKey)}</div>
    </body>
  `);
}));

server.get('/gists', (req, res) => {
  // Retrieve a list of all gists for the currently authed user
  github.gists.getForUser({ username })
    .then((response) => {
      const data = response.data.map( gist => {
        const fileName = Object.values(gist.files)[0].filename;
        return {
          fileName: fileName,
          id: gist.id
        };
      });
      res.json(data);
    })
    .catch((err) => {
      res.json(err);
    });
});

server.get('/key', (req, res) => {
  // TODO: Display the secret key used for encryption of secret gists
  res.send(mySecretKeyString);
});

server.get('/setkey:keyString', (req, res) => {
  // TODO: Set the key to one specified by the user or display an error if invalid
  const keyString = req.query.keyString;
  try {
    mySecretKeyString = keyString;
    res.status(200).redirect('/');
  } catch (err) {
    // failed
    res.send('Failed to set key.  Key string appears invalid.');
  }
});

server.get('/fetchmessagefromself:id', asyncHandler(async (req, res) => {
  // TODO:  Retrieve and decrypt the secret gist corresponding to the given ID
  const gist_id = req.query.id;
  const response = await github.gists.get({id: gist_id });
  let content = Object.values(response.data.files)[0].content;

  let contentArray = content.split('');
  let nonceArray = contentArray.splice(0, 32);

  content = contentArray.join('');
  nonce = nonceArray.join('');

  // console.log('content is ', content);
  // console.log('nonce is ', nonce);

  let decodedContentArray = nacl.util.decodeBase64(content);
  let decodedNonceArray = nacl.util.decodeBase64(nonce);
  const decodedSecretKey = nacl.util.decodeBase64(mySecretKeyString)

  content = nacl.secretbox.open(decodedContentArray, decodedNonceArray, decodedSecretKey)
  res.status(200).send(nacl.util.encodeUTF8(content));
}));



server.post('/create', urlencodedParser, (req, res) => {
  // Create a private gist with name and content given in post request
  const { name, content } = req.body;
  const files = { [name]: { content } };
  github.gists.create({ files, public: false })
    .then((response) => {
      res.json(response.data);
    })
    .catch((err) => {
      res.json(err);
    });
});

server.post('/createsecret', urlencodedParser, (req, res) => {
  // TODO:  Create a private and encrypted gist with given name/content
  // NOTE - we're only encrypting the content, not the filename
  const { name, content } = req.body;

  // let key = nacl.randomBytes(nacl.secretbox.keyLength);
  // mySecretKeyString = key;

  let nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  let msg = nacl.util.decodeUTF8(content);

  const decodedSecretKey = nacl.util.decodeBase64(mySecretKeyString)
  let encryptedNonceAndMessageArray = nacl.secretbox(msg, nonce, decodedSecretKey);

  const encryptedGist = nacl.util.encodeBase64(encryptedNonceAndMessageArray);
  const encodedNonce = nacl.util.encodeBase64(nonce);

  // console.log('encryptegist is ', encryptedGist);
  // console.log('encondedNonce is ', encodedNonce);

  const files = { [name]: { content: encodedNonce + encryptedGist } };
  github.gists.create({ files, public: false })
    .then((response) => {
      res.json(response.data);
    })
    .catch((err) => {
      res.json(err);
    });
});

server.post('/postmessageforfriend', urlencodedParser, (req, res) => {
  // TODO:  Create a private and encrypted gist with given name/content
  // using someone else's public key that can be accessed and
  // viewed only by the person with the matching private key
  // NOTE - we're only encrypting the content, not the filename

  const { name, content, publicKeyString } = req.body;
  const keypair = nacl.box.keyPair.fromSecretKey(nacl.util.decodeBase64(mySecretKeyString));

  // let key = nacl.randomBytes(nacl.secretbox.keyLength);
  // mySecretKeyString = key;

  let nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  let msg = nacl.util.decodeUTF8(content);

  const decodedSecretKey = nacl.util.decodeBase64(mySecretKeyString);
  const decodedPublicKey = nacl.util.decodeBase64(publicKeyString);
  let cipherText = nacl.box(msg, nonce, decodedPublicKey, decodedSecretKey);

  cipherText = nacl.util.encodeBase64(cipherText);
  const encodedNonce = nacl.util.encodeBase64(nonce);

  // console.log('encryptegist is ', encryptedGist);
  // console.log('encondedNonce is ', encodedNonce);
console.log('cipherText is ', encodedNonce + cipherText)
  const files = { [name]: { content: encodedNonce + cipherText } };
  console.log('got here');
  github.gists.create({ files, public: false })
    .then((response) => {
      const messageString = nacl.util.encodeBase64(keypair.publicKey) + response.data.id;
      console.log('message string', messageString);
      res.send(`
      <html>
        <header><title>Message Saved</title></header>
        <body>
          <h1>Message Saved</h1>
          <div>Give this string to your friend for decoding.</div>
          <div>${messageString}</div>
          <div>
        </body>
      `);
    })
    .catch((err) => {
  console.log('error! ', err);
      res.json(err);
    });
});

server.get('/fetchmessagefromfriend:messageString', urlencodedParser, (req, res) => {
  // TODO:  Retrieve and decrypt the secret gist corresponding to the given ID
  const messageString = req.query.messageString;
  const friendPublicStringArray = nacl.util.decodeBase64(messageString.slice(0, 44));
  const id = messageString.slice(44, messageString.length);
  console.log('gist id ', id);

  github.gists.get({ id }).then((response) => {
    const gist = response.data;
    let content = Object.values(gist.files)[0].content;
    res.send(gist);

    console.log("content is ", content);
    // const nonce = nacl.util.decodeBase64(blob.slice(0, 32));
    // console.log('nounce is ', nonce.length);
    // const content = blob.slice(32, blob.length);
    // console.log('content is ', content);
    // const ciphertext = nacl.util.decodeBase64(content);
    // console.log('ciphertext ', ciphertext.length);
    // console.log('friendPublicStringArray ', friendPublicStringArray.length);

    let contentArray = content.split('');
    let nonceArray = contentArray.splice(0, 32);

    content = contentArray.join('');
    nonce = nonceArray.join('');

    let decodedContentArray = nacl.util.decodeBase64(content);
    let decodedNonceArray = nacl.util.decodeBase64(nonce);
    const decodedSecretKey = nacl.util.decodeBase64(mySecretKeyString)

    content = nacl.secretbox.open(decodedContentArray, decodedNonceArray, decodedSecretKey)

    res.send(nacl.util.encodeUTF8(content));
  })
  .catch((err) => {
    console.log(err);
    res.json(err);
  });

});

/* OPTIONAL - if you want to extend functionality */
server.post('/login', (req, res) => {
  // TODO log in to GitHub, return success/failure response
  // This will replace hardcoded username from above
  // const { username, oauth_token } = req.body;
  res.json({ success: false });
});

/*
Still want to write code? Some possibilities:
-Pretty templates! More forms!
-Better management of gist IDs, use/display other gist fields
-Support editing/deleting existing gists
-Switch from symmetric to asymmetric crypto
-Exchange keys, encrypt messages for each other, share them
-Let the user pass in their private key via POST
*/

server.listen(3000);
