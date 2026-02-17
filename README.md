# ♟️ Chessyy - Real-Time Multiplayer Chess

A sleek, real-time multiplayer chess application built with **Node.js**, **Socket.io**, and **Chess.js**. Play classic chess against friends or random opponents instantly!

---

## 🚀 Live Demo

### **[Play Now on Render](https://chessyy.onrender.com)**

> **⚠️ Important:** This is a real-time multiplayer game.  
> If you are the first person to join, you will see a **"Waiting for opponent"** screen.  
> To test it yourself immediately: **Open the link in two different browser tabs**

---

## ✨ Features

- **Real-Time Gameplay:** Instant move updates and board synchronization using WebSockets.
- **Click-to-Move Interface:** Simple and intuitive piece movement (desktop & mobile friendly).
- **Move Validation:** Legal moves are highlighted; illegal moves are prevented automatically.
- **Game States:** Automatic detection of **Check**, **Checkmate**, **Draw**, and **Stalemate**.
- **Player Roles:** Automatic assignment of White (first player) and Black (second player) pieces.
- **Spectator Mode:** Additional users can watch the game in progress.
- **Responsive Design:** Fully responsive UI built with Tailwind CSS.

---

## 🛠️ Tech Stack

- **Frontend:** HTML5, EJS (Templating), Vanilla JavaScript, Tailwind CSS
- **Backend:** Node.js, Express.js
- **Real-Time Communication:** Socket.io
- **Game Logic:** Chess.js (Move validation and state management)

---

## 🎮 How to Play

1. **Start a Game:**
   - Open the [Live Link](https://chessyy.onrender.com).
   - If no one else is online, you will wait in the lobby.
   - Share the link with a friend or open a second tab to simulate an opponent.

2. **Gameplay:**
   - **White moves first.**
   - Click on a piece to select it, then click on a valid square to move.
   - Valid moves are highlighted with a small dot 🟢.
   - Capture moves are highlighted with a ring ⭕.

3. **Winning:**
   - Checkmate your opponent's King to win!
   - The game will announce the winner or the reason for a draw/stalemate.

---

## 💻 Local Installation

To run this project locally on your machine:

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/addy015/chessyy.git
    cd chessyy
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Run the Server**
    ```bash
    npx nodemon app.js
    # OR
    npm start
    ```

4.  **Play Locally**
    - Open your browser and go to `http://localhost:3000`.
    - Open a second tab to `http://localhost:3000` to play as the second player.

---

## 🤝 Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 License

This project is open source and available under the [MIT License](LICENSE).
