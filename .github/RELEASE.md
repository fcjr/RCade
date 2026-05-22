# Release workflows

The `Publish CLIs`, `Publish TS SDK`, `Publish TS Plugins`, and `Release Cabinet`
workflows bump a package version, commit + tag, push to `main`, and then
publish/build artifacts.

`main` has a repository ruleset that requires all changes to go through a pull
request. That blocks the default `GITHUB_TOKEN` from pushing the version-bump
commit directly. To work around this, these workflows authenticate as a GitHub
App that is on the ruleset's bypass list.

## How it works

1. Each release workflow's `bump` job calls
   [`actions/create-github-app-token`](https://github.com/actions/create-github-app-token)
   with `RELEASE_APP_ID` and `RELEASE_APP_PRIVATE_KEY` to mint a short-lived
   installation token.
2. `actions/checkout` is configured with that token, so subsequent
   `git push` calls in the same job push as the app.
3. The ruleset's bypass list includes the app, so the push is accepted even
   though it's a direct push to `main`.

The token expires after one hour and is revoked at the end of the job. The
commit author/committer remains "Frank Chiarulli Jr." (set via `git config`);
only the *pusher* is the app.

The `Clone to RCade Community` workflow uses a separate app
(`COMMUNITY_APP_ID` / `COMMUNITY_APP_PRIVATE_KEY`) installed on the
`rcade-community` org — unrelated to the release app described here.

## One-time setup

If the app is ever lost (e.g. account migration) or you need to rotate the
private key, repeat these steps.

### 1. Create the GitHub App

- Go to https://github.com/settings/apps/new
- **Name**: `rcade-release-bot` (or similar)
- **Homepage URL**: anything (e.g. `https://github.com/fcjr/RCade`)
- **Webhook**: uncheck "Active"
- **Repository permissions**: **Contents → Read and write** (everything else
  "No access")
- **Where can this GitHub App be installed?**: "Only on this account"
- Click **Create GitHub App**
- On the next page, scroll down → **Generate a private key** (downloads a
  `.pem` file)
- Note the **App ID** at the top of the page

### 2. Install the app on the repo

- App page → left sidebar → **Install App** → install on your account
- Choose **Only select repositories** → `fcjr/RCade`

### 3. Add the app to the ruleset bypass list

- Repo **Settings → Rules → Rulesets** → open the ruleset that requires PRs
- **Bypass list → Add bypass** → search for the app → **Add**
- Mode: **Always**
- Save

### 4. Add the secrets

Repo **Settings → Secrets and variables → Actions** → **Secrets** tab:

| Name                       | Value                                              |
| -------------------------- | -------------------------------------------------- |
| `RELEASE_APP_ID`           | App ID number from step 1                          |
| `RELEASE_APP_PRIVATE_KEY`  | Full contents of the `.pem` file (BEGIN/END lines included) |

## Rotating the private key

1. On the app's settings page → **Generate a new private key**
2. Update the `RELEASE_APP_PRIVATE_KEY` repo secret with the new `.pem`
3. Delete the old key from the app's settings page
