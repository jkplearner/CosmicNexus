# Cosmic Helix 🌌

**Cosmic Helix** is an interactive 3D solar system simulation built with **React**, **Three.js**, and **Vite**. It features a realistic, helical visualization of the solar system's movement through the galaxy, enhanced by AI-powered insights.

## Features 🚀

-   **Interactive 3D Solar System**: Explore the Sun, planets, and Voyagers in a high-performance WebGL environment.
-   **Helical Movement**: Visualize the solar system's true motion through the Milky Way.
-   **Nexus AI Guide**: Chat with "Nexus," an onboard AI assistant powered by Google Gemini, for space facts and cosmic lore.
-   **Real-time Analysis**: Click on any celestial body to get a generated scientific summary.
-   **Cinematic Effects**: Includes bloom, starfields, and procedural textures for a premium visual experience.

## Tech Stack 🛠️

-   **Frontend**: React 19, Vite
-   **3D Engine**: Three.js, React Three Fiber ecosystem (via raw Three.js)
-   **Styling**: Tailwind CSS
-   **AI**: Google Gemini API
-   **Icons**: Lucide React

## Getting Started 🏁

### Prerequisites

-   Node.js (v18+)
-   npm or yarn

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/cosmic-helix.git
    cd cosmic-helix
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Set up Environment Variables:
    -   Create a `.env` file in the root directory.
    -   Add your Gemini API key:
        ```env
        VITE_API_KEY=your_gemini_api_key_here
        ```

    > **Security Note**: This is a client-side application. The API key is embedded in the build. Do not use a production key with unlimited quota. Set up API key restrictions (referrer/IP) in your Google Cloud Console to prevent unauthorized usage.

4.  Run the development server:
    ```bash
    npm run dev
    ```

5.  Open [http://localhost:5173](http://localhost:5173) in your browser.

## Building for Production 📦

To create a production build:

```bash
npm run build
```

The output will be in the `dist` folder, ready for deployment to Vercel, Netlify, or any static host.

## Controls 🎮

-   **Left Click + Drag**: Rotate Camera
-   **Right Click + Drag**: Pan Camera
-   **Scroll**: Zoom In/Out
-   **Click Object**: Select planet/star for details
-   **UI Controls**: Pause simulation, adjust speed, toggle chat.

