# Friend lobbies

The game page can be hosted as static files, including on GitHub Pages. The lobby relay needs a Node.js host that supports WebSockets.

## Run everything from one server

Install Node.js, then run these commands in the project folder:

```sh
npm install
npm start
```

Open the address printed by the server. Friends need to open the same public address to join your lobby code.

## Host the page on GitHub Pages

1. Deploy this repository's Node service using `npm install` as the build command and `npm start` as the start command. The service must allow WebSocket connections and expose its public HTTPS URL.
2. In `js/multiplayer-config.js`, set `window.MULTIPLAYER_SERVER_URL` to that service URL, such as `https://your-service.example.com`.
3. Publish the game files through GitHub Pages. Invite friends to the GitHub Pages address; they will connect to the lobby service configured above.

Lobby codes exist only while the Node service is running. Each lobby supports up to six players. The host runs the simulation at a fixed 1x speed and relays the shared state; Play/Pause and Simulation Speed controls are hidden for everyone until they leave the lobby.
