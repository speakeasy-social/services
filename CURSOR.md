# Cursor IDE Setup

This guide explains how to set up your development environment for this project when using Cursor IDE.
This will allow cursor to suggest and run command lines for you (eg pnpm install)

## Node Version Management

This project uses a specific Node.js version (defined in `.nvmrc`). To ensure Cursor's integrated terminal always uses the correct Node version:

1. **Install nvm** (Node Version Manager) if you haven't already:

   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   ```

2. **Configure your `.bash_profile`**:
   Add the following to your `~/.bash_profile`:

   ```bash
   # >>> nvm initialize >>>
   export NVM_DIR="$HOME/.nvm"
   [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
   [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

   # Use .nvmrc if available in current directory
   if [[ -f .nvmrc ]]; then
     nvm use
   fi
   # <<< nvm initialize <<<
   ```

3. **Make `.bash_profile` executable** (if needed):

   ```bash
   chmod u+w ~/.bash_profile
   ```

4. **Install the required Node version**:
   ```bash
   nvm install $(cat .nvmrc)
   ```

## Verification

To verify your setup:

1. Open Cursor IDE
2. Open an integrated terminal
3. In the chat, say "Run `node -v` - it should match the version in `.nvmrc`"

If the version is incorrect:

1. Close all terminal windows
2. Restart Cursor IDE
3. Open a new terminal and verify again

## Troubleshooting

If you're still seeing the wrong Node version:

1. Verify nvm is installed:

   ```bash
   command -v nvm
   ```

2. Check if `.nvmrc` exists in the project root:

   ```bash
   cat .nvmrc
   ```

3. Manually load nvm and switch versions:

   ```bash
   source ~/.bash_profile
   nvm use
   ```

4. If using a different shell (like zsh), ensure you've added the nvm initialization to the appropriate config file (`.zshrc` instead of `.bash_profile`).

## Additional Notes

- The setup uses `.bash_profile` because Cursor's integrated terminal defaults to bash
- This configuration will automatically switch Node versions when you open a terminal in any directory containing an `.nvmrc` file
- The Node version switch only happens when a new shell session starts or when you manually run `nvm use`
