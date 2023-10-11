const {
  SubscriptionManager,
  SecretsManager,
  createGist,
  deleteGist,
  simulateScript,
  decodeResult,
  ResponseListener,
  Location,
} = require("@chainlink/functions-toolkit")

task("delete-gist", "deletes the uploaded gist")
  .addParam("gistUrl", "URL for the secret gist with encrypted secrets")
  .setAction(async (taskArgs) => {
    const gistUrl = taskArgs.gistUrl

    console.log(`\nDeleting gist at ${gistUrl}...`)
    const successfulDeletion = await deleteGist(process.env["GITHUB_API_TOKEN"], gistUrl)
    if (!successfulDeletion) {
      console.log(`Failed to delete gist at ${gistUrl}. Please delete manually.`)
    } else {
      console.log("\nSecret Gist deleted.")
    }
  })
