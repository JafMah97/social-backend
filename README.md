# 🧠 Social Backend

A modern, real-time backend built with **Fastify**, **TypeScript**, and **Socket.IO**. Designed for speed, scalability, and developer joy.

---

## 🚀 Features

This project leverages a powerful and modern tech stack to provide a robust and efficient backend for social applications.

- **Fastify:** A highly performant and low-overhead Node.js framework.
- **TypeScript:** Ensures type safety and improves code quality.
- **Socket.IO:** Enables real-time, bidirectional communication between clients and the server.
- **ESM:** Uses the modern `import/export` syntax for cleaner, more maintainable code.
- **Expressive CLI:** Utilizes libraries like **Chalk**, **Boxen**, and **Figlet** for a visually appealing and informative command-line interface.

---

## 📦 Project Structure

```text
|   server.ts
|   
+---bootStrap
|       app.ts
|       keepAlive.ts
|       logger.ts
|       
+---modules
|   +---auth
|   |   |   authErrorHandler.ts
|   |   |   authIndex.ts
|   |   |   authSchemas.ts
|   |   |
|   |   \---routes
|   |           delete.ts
|   |           forgotPassword.ts
|   |           login.ts
|   |           logout.ts
|   |           register.ts
|   |           resendVerificationEmail.ts
|   |           resetPassword.ts
|   |           verifiyEmailWithLink.ts
|   |           verifyEmailWithCode.ts
|   |
|   +---post
|   |   |   postErrorHandler.ts
|   |   |   postIndex.ts
|   |   |   postSchemas.ts
|   |   |
|   |   \---routes
|   |           create.ts
|   |           delete.ts
|   |           get.ts
|   |           like.ts
|   |           list.ts
|   |           save.ts
|   |           saved.ts
|   |           unlike.ts
|   |           unsave.ts
|   |           update.ts
|   |
|   \---user
+---plugins
|       authenticate.ts
|       client.ts
|       errorHandler.ts
|       prisma.ts
|       sensible.ts
|       websocket.ts
|
+---types
|       fastify-list-routes.d.ts
|       fastify.d.ts
|
\---utils
        deleteUserAndData.ts
        hash.ts
        mailer.ts
        multipartFieldsToBody.ts
        saveMultipartImage.ts
        seed.ts
        uploadToImagekit.ts

```

## 🛣️ Roadmap

- [ ] User authentication
- [ ] RESTful API routes
- [ ] WebSocket rooms
- [ ] Database integration (Prisma)

## 🛠️ Setup & Run

### Prerequisites

- Node.js (v18 or higher recommended)

### Installation

1.  Clone the repository:
    ```bash
    git clone <your-repository-url>
    ```
2.  Navigate to the project directory:
    ```bash
    cd social-backend
    ```
3.  Install dependencies:

    ```bash
    npm install
    ```

## ⚙️ Configuration

### Default Settings

- **Port:** `3000`
- **Mode:** `development`
- **Timezone:** `Europe/Paris`

## Project Details

### 📄 License

This project is licensed under the MIT License—feel free to use, fork, and contribute.

### ✨ Author

Made with ❤️ by JafMah97
