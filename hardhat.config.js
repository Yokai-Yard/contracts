const fs = require('fs');
const dotenv = require('dotenv');
const taskNames = require('hardhat/builtin-tasks/task-names');

require('@nomiclabs/hardhat-etherscan');
require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-ethers');
require('hardhat-gas-reporter');
require('hardhat-deploy');
require('solidity-coverage');

dotenv.config();

const defaultNetwork = 'localhost';

function mnemonic() {
  try {
    return fs.readFileSync('./mnemonic.txt').toString().trim();
  } catch (e) {
    if (defaultNetwork !== 'localhost') {
      console.log('☢️ WARNING: No mnemonic file created for a deploy account.');
    }
  }
  return '';
}

// When using the hardhat network, you may choose to fork Fuji or Avalanche Mainnet
// This will allow you to debug contracts using the hardhat network while keeping the current network state
// To enable forking, turn one of these booleans on, and then run your tasks/scripts using ``--network hardhat``
// For more information go to the hardhat guide
// https://hardhat.org/hardhat-network/
// https://hardhat.org/guides/mainnet-forking.html

module.exports = {
  defaultNetwork,
  networks: {
    localhost: {
      url: 'http://localhost:8545',
      blockGasLimit: 0x1fffffffffffff,
    },
    fuji: {
      url: 'https://api.avax-test.network/ext/bc/C/rpc',
      gasPrice: 225000000000,
      chainId: 43113,
      accounts: {
        mnemonic: mnemonic(),
      },
    },
    avax: {
      url: 'https://api.avax.network/ext/bc/C/rpc',
      gasPrice: 225000000000,
      chainId: 43114,
      accounts: {
        mnemonic: mnemonic(),
      },
    },
    chainstack: {
      url: 'https://nd-274-434-047.p2pify.com/648ffb21504d82b842193feaafb6c1f2/ext/bc/C/rpc',
      gasPrice: 225000000000,
      chainId: 43113,
      accounts: {
        mnemonic: mnemonic(),
      },
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    feeCollector: {
      default: 0,
    },
  },
  solidity: {
    version: '0.8.6',
    settings: {
      optimizer: {
        enabled: true,
        // https://docs.soliditylang.org/en/v0.6.3/using-the-compiler.html
        runs: 10000,
      },
    },
  },
  mocha: {
    bail: true,
    timeout: 6000,
  },
  gasReporter: {
    currency: 'USD',
    // gasPrice: 21,
    enabled: !!process.env.REPORT_GAS,
    showTimeSpent: true,
  },
  etherscan: {
    apiKey: `${process.env.ETHERSCAN_API_KEY}`,
  },
};

// List details of deployer account.
task('account', 'Get balance informations for the deployment account.', async (_, { ethers }) => {
  const hdkey = require('ethereumjs-wallet/hdkey');
  const bip39 = require('bip39');
  let mnemonic = fs.readFileSync('./mnemonic.txt').toString().trim();
  const seed = await bip39.mnemonicToSeed(mnemonic);

  const hdwallet = hdkey.fromMasterSeed(seed);
  const wallet_hdpath = "m/44'/60'/0'/0/";
  const account_index = 0;
  let fullPath = wallet_hdpath + account_index;
  const wallet = hdwallet.derivePath(fullPath).getWallet();
  var EthUtil = require('ethereumjs-util');
  const address = '0x' + EthUtil.privateToAddress(wallet._privKey).toString('hex');
  console.log(wallet)
  console.log('Deployer Account: ' + address);
  for (let n in config.networks) {
    try {
      let provider = new ethers.providers.JsonRpcProvider(config.networks[n].url);
      let balance = await provider.getBalance(address);
      console.log(' -- ' + n + ' --  -- -- 📡 ');
      console.log('   balance: ' + ethers.utils.formatEther(balance));
      console.log('   nonce: ' + (await provider.getTransactionCount(address)));
    } catch (e) {
      console.log(e);
    }
  }
});

task('compile:one', 'Compiles a single contract in isolation')
  .addPositionalParam('contractName')
  .setAction(async function (args, env) {
    const sourceName = env.artifacts.readArtifactSync(args.contractName).sourceName;

    const dependencyGraph = await env.run(taskNames.TASK_COMPILE_SOLIDITY_GET_DEPENDENCY_GRAPH, {
      sourceNames: [sourceName],
    });

    const resolvedFiles = dependencyGraph.getResolvedFiles().filter((resolvedFile) => {
      return resolvedFile.sourceName === sourceName;
    });

    const compilationJob = await env.run(
      taskNames.TASK_COMPILE_SOLIDITY_GET_COMPILATION_JOB_FOR_FILE,
      {
        dependencyGraph,
        file: resolvedFiles[0],
      },
    );

    await env.run(taskNames.TASK_COMPILE_SOLIDITY_COMPILE_JOB, {
      compilationJob,
      compilationJobs: [compilationJob],
      compilationJobIndex: 0,
      emitsArtifacts: true,
      quiet: true,
    });
  });
