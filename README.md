# SimpleChessFe

This is a simple two-player online chess game built with Angular and PocketBase.

## Backend Setup (PocketBase)

This project requires a PocketBase backend.

### 1. Create Collection

You need to create a `game_state` collection in your PocketBase instance (`https://simple-chess-pb-backend.fly.dev`).

You can do this in two ways:

#### Option A: Import Schema (Recommended)

1. Go to your PocketBase Admin Dashboard -> **Settings** -> **Import collections**.
2. Upload or copy the content of the `pb_schema.json` file found in the root of this repository.
3. Click **Import**.

#### Option B: Manual Setup

Create a collection named `game_state` with the following fields:

- `fen`: **Text**
- `pgn`: **Text**
- `status`: **Select** (Max Select: 1). Values:
  - `New`
  - `White Move`
  - `Black Move`
  - `In Check`
  - `Checkmate`
  - `Stalemate`
- `white_player`: **Relation** (Single, Collection: `users`)
- `black_player`: **Relation** (Single, Collection: `users`)

**API Rules**:
Set the following API Rules for the `game_state` collection to allow authenticated access:

- **List/Search Rule**: `@request.auth.id != ""`
- **View Rule**: `@request.auth.id != ""`
- **Create Rule**: `@request.auth.id != ""`
- **Update Rule**: `@request.auth.id != ""`
- **Delete Rule**: (Leave empty or null for admin only)

### 2. Users Collection

The default `users` collection is sufficient. Ensure **Registration** is enabled (it is by default).

## Frontend Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Run the development server:

   ```bash
   npm start
   ```

3. Open `http://localhost:4200` in your browser.

## How to Play

1. Open the application in two different browsers (or use Incognito mode).
2. **Player 1**: Sign up and Login. Click "Join as White".
3. **Player 2**: Sign up and Login. Click "Join as Black".
4. Moves will be synchronized in real-time.
