# How to run

## Run a React web app in VS Code

1. Open the project folder in VS Code
2. Open a terminal in VS Code (Terminal → New Terminal)
3. Install dependencies (if not already installed):

   ```bash
   npm install
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Click on the link in the terminal (usually <http://localhost:5173/>) or hold Ctrl and click the link
6. Alternatively, you can create a VS Code task:
   - Press `Ctrl+Shift+P` and type "Tasks: Configure Default Build Task"
   - Choose "Create tasks.json file from template"
   - Select "npm"
   - Replace the content of the created tasks.json file with:

     ```json
     {
       "version": "2.0.0",
       "tasks": [
         {
           "type": "npm",
           "script": "dev",
           "problemMatcher": [],
           "label": "npm: dev",
           "detail": "vite",
           "group": {
             "kind": "build",
             "isDefault": true
           }
         }
       ]
     }
     ```

   - Now you can run the app using `Ctrl+Shift+B`

## Run a React web app in WebStorm/Windows

1. Click the text `Current File` (top right of the screen) and select `Edit Configurations...`
2. Press `+` and select `npm`
3. Change fields:
    - Name: `npm start`
    - Package.json: `~\Documents\GitHub\kiss-for-react\examples\todo-app-example\package.json`
    - Command: `run`
    - Scripts: `dev`
    - Arguments: ``
    - Node interpreter: `Project node ([path]\nodejs\node.exe)`
    - Package manager: `Project [path]\nodejs\npm.cmd`
    - Environment: ``
    - Before launch: ``
    - Show this page: OFF
    - Activate tool window: ON
    - Focus tool window: OFF
4. Press `OK`.
5. Click the play button next to `npm start` (top right of the screen)
