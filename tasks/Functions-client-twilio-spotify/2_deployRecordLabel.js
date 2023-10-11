const { types } = require("hardhat/config")
const { DEFAULT_VERIFICATION_BLOCK_CONFIRMATIONS, networks } = require("../../networks")

task("functions-deploy-recordlabel", "Deploys the RecordLabel contract")
  .addParam("stcContract", "Contract address for the Simple Stable Coin")
  .addOptionalParam("verify", "Set to true to verify client contract", false, types.boolean)
  .setAction(async (taskArgs) => {
    if (network.name === "hardhat") {
      throw Error(
        'This command cannot be used on a local hardhat chain.  Specify a valid network or simulate a RecordLabel request locally with "npx hardhat functions-simulate".'
      )
    }

    const stcAddress = taskArgs.stcContract
    if (!ethers.utils.isAddress(stcAddress))
      throw Error("Please provide a valid contract address for the SimpleStableCoin contract")

    console.log(`Deploying RecordLabel contract to ${network.name}`)
    const functionsRouter = networks[network.name]["functionsRouter"]
    const donIdBytes32 = hre.ethers.utils.formatBytes32String(networks[network.name]["donId"])

    console.log("\n__Compiling Contracts__")
    await run("compile")

    const overrides = {}
    // If specified, use the gas price from the network config instead of Ethers estimated price
    if (networks[network.name].gasPrice) {
      overrides.gasPrice = networks[network.name].gasPrice
    }
    // If specified, use the nonce from the network config instead of automatically calculating it
    if (networks[network.name].nonce) {
      overrides.nonce = networks[network.name].nonce
    }

    // Deploy RecordLabel
    const consumerContractFactory = await ethers.getContractFactory("RecordLabel")
    const consumerContract = await consumerContractFactory.deploy(functionsRouter, donIdBytes32, stcAddress, overrides)

    console.log(
      `\nWaiting ${DEFAULT_VERIFICATION_BLOCK_CONFIRMATIONS} blocks for transaction ${consumerContract.deployTransaction.hash} to be confirmed...`
    )
    await consumerContract.deployTransaction.wait(DEFAULT_VERIFICATION_BLOCK_CONFIRMATIONS)

    // Verify the RecordLabel Contract
    const verifyContract = taskArgs.verify

    if (verifyContract && (process.env.POLYGONSCAN_API_KEY || process.env.ETHERSCAN_API_KEY)) {
      try {
        console.log("\nVerifying contract...")
        await consumerContract.deployTransaction.wait(Math.max(6 - DEFAULT_VERIFICATION_BLOCK_CONFIRMATIONS, 0))
        await run("verify:verify", {
          address: consumerContract.address,
          constructorArguments: [functionsRouter, donIdBytes32, stcAddress],
        })
        console.log("RecordLabel verified")
      } catch (error) {
        if (!error.message.includes("Already Verified")) {
          console.log("Error verifying contract.  Try delete the ./build folder and try again.")
          console.log(error)
        } else {
          console.log("Contract already verified")
        }
      }
    } else if (verifyContract) {
      console.log("\nPOLYGONSCAN_API_KEY or ETHERSCAN_API_KEY missing. Skipping contract verification...")
    }

    console.log(`\nRecordLabel contract deployed to ${consumerContract.address} on ${network.name}`)
  })
