"use strict";

const contractAddr = '0x00b51788d681ce1dabbf3e43592c0c35d4668421';
const dividendTokenAddr = '0xe9e7cea3dedca5984780bafc599bd69add087d56';
const bnbAddr = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

let totalHolders = 0;
let tokenInfo, dividendTokenInfo,tokenprice;
let secondsUntilAutoClaimAvailable = 0;
let claimCountdownInterval = null;

 // Unpkg imports
const Web3Modal = window.Web3Modal.default;
const WalletConnectProvider = window.WalletConnectProvider.default;
const Fortmatic = window.Fortmatic;
const evmChains = window.evmChains;

// Web3modal instance
let web3Modal;

// Chosen wallet provider given by the dialog window
let provider;

let web3;

// Contract to interact with
let contract;

// Address of the selected account
let selectedAccount;


/**
 * Setup the orchestra
 */
function init() {
  // Check that the web page is run in a secure context,
  // as otherwise MetaMask won't be available
  if(location.protocol !== 'https:') {
    // https://ethereum.stackexchange.com/a/62217/620
    const alert = document.querySelector("#alert-error-https");
    alert.style.display = "block";
    document.querySelector("#btn-connect").setAttribute("disabled", "disabled");
    return;
  }

  // Tell Web3modal what providers we have available.
  // Built-in web browser provider (only one can exist as a time)
  // like MetaMask, Brave or Opera is added automatically by Web3modal
  const providerOptions = {
    walletconnect: {
      package: WalletConnectProvider,
      display: { name: 'Trust Wallet/MetaMask/Mobile' },
      options: {
          rpc: { 56: 'https://bsc-dataseed1.ninicoin.io' },
          network: 'binance',
          //infuraId: "a6ca7a0157184aedbafef89ee4794dc2",
      }
    }

    // fortmatic: {
    //   package: Fortmatic,
    //   options: {
    //     //key: "pk_test_XXX"
    //   }
    // }
  };

  web3Modal = new Web3Modal({
    cacheProvider: false, // optional
    providerOptions, // required
    disableInjectedProvider: false, // optional. For MetaMask / Brave / Opera.
  });

  // console.log("Web3Modal instance is", web3Modal);
}


async function initContract() {
  // Get list of accounts of the connected wallet
  const accounts = await web3.eth.getAccounts();

  // MetaMask does not give you all accounts, only the selected account
  selectedAccount = accounts[0];

  const newContract = new web3.eth.Contract(contractAbi, contractAddr, {
    from: selectedAccount, // default from address
    //gasPrice: '20000000000', // default gas price in wei, 20 gwei in this case
    //gasLimit: 1000000
  });

  return newContract;
}



async function fetchPancakeData() {
  const respDividendToken = await fetch('https://api.pancakeswap.info/api/v2/tokens/' + dividendTokenAddr);
  dividendTokenInfo = await respDividendToken.json();
  const responsetoken2= await fetch('https://bsc.api.0x.org/swap/v1/quote?buyToken=BUSD&sellToken='+contractAddr+'&sellAmount=1000000000000000');
  const responseToken = await fetch('https://api.pancakeswap.info/api/v2/tokens/' + contractAddr);
  tokenInfo = await responseToken.json();
  console.log(tokenInfo);
  console.log(dividendTokenInfo);
}



async function fetchTokenData() {
  contract.methods.totalDistributed()
    .call()
    .then(function(value) {
      totalHolders = value;
    });
  contract.methods.getTotalDividendsDistributed()
    .call()
    .then(function(value) {
      document.querySelector("#dividends-distributed").textContent = amountToStr(dividendToNumber(web3, value), 0) + ' ' + dividendTokenInfo.data.symbol;
    });
}




/**
 * Kick in the UI action after Web3modal dialog has chosen a provider
 */
async function fetchData() {
  let tokenBalance = 0;

  clearCountdownInterval();
  clearAccountInfo();

  await fetchPancakeData();
  await fetchTokenData();

  document.querySelector("#token-price").textContent = parseFloat(dividendTokenInfo.data.price).toFixed(9) + '$';

  contract.methods.balanceOf(selectedAccount)
    .call()
    .then(function(balance) {
      tokenBalance = tokenToNumber(web3, balance);
      document.querySelector("#token-balance").textContent = amountToStr(tokenBalance, 3);
      return contract.methods.getAccountDividendsInfo(selectedAccount).call();
    })
    .then(function(values) {
      const iterationsLeft = values[2];
      const withdrawableDividends = values[3];
      const totalDividends = values[4];
      const lastClaimTime = values[5];
      const nextClaimTime = values[6];
      secondsUntilAutoClaimAvailable = values[7];
      const dividendsPayed = dividendToNumber(web3, web3.utils.toBN(totalDividends).sub(web3.utils.toBN(withdrawableDividends)));

      document.querySelector("#dividends-payed").textContent = amountToStr(dividendsPayed, 2) + ' ' + dividendTokenInfo.data.symbol;
      if (lastClaimTime > 0) {
        const lastPayment = new Date(lastClaimTime * 1000);
        document.querySelector("#last-payment").textContent = lastPayment.toLocaleDateString() + ' ' + lastPayment.toLocaleTimeString();
      }
      document.querySelector("#withdrawable-dividends").textContent = amountToStr(dividendToNumber(web3, withdrawableDividends), 6) + ' ' + dividendTokenInfo.data.symbol;
      document.querySelector("#auto-payment-bar").style.width = (iterationsLeft * 100 / totalHolders).toString() + '%';

      if (dividendToNumber(web3, withdrawableDividends) == 0) {
        document.querySelector("#btn-claim-text").textContent = "Claim my dividends";
        document.querySelector("#btn-claim").setAttribute("disabled", "disabled");
      }
      else {
        claimCountdownInterval = setInterval(function x() {
          secondsUntilAutoClaimAvailable--;
          if (secondsUntilAutoClaimAvailable > 0) {
            document.querySelector("#btn-claim-text").textContent = "Claim in " + secondsUntilAutoClaimAvailable + " secs";
            document.querySelector("#btn-claim").setAttribute("disabled", "disabled");
          } else {
            document.querySelector("#btn-claim-text").textContent = "Claim my dividends";
            document.querySelector("#btn-claim").removeAttribute("disabled");
            clearCountdownInterval();
          }
          return x;
        }(), 1000);
      }
    })
    .then(function() {
      showEstimations(tokenBalance);

      // Display fully loaded UI for wallet data
      document.querySelector("#prepare").style.display = "none";
      document.querySelector("#connected").style.display = "block";
      document.querySelector("#button-bar").style.display = "block";
    })
    .catch(function(err) {
      document.querySelector("#btn-claim").setAttribute("disabled", "disabled");
    });
}


function showEstimations(tokenBalance) {
  let supplyRatio = tokenBalance / (69000000000);
  console.log(tokenBalance);
  console.log( supplyRatio);
  let dailyVolume = document.querySelector("#daily-volume-txt").value;
  console.log(dailyVolume);
  let hourlyVolume = dailyVolume / 24;
  console.log(hourlyVolume);
  console.log(tokenInfo.data.price);
  console.log(dividendTokenInfo.data.price);
  let hourlyDividendsGenerated = (hourlyVolume * 0.12 * tokenInfo.data.price) / dividendTokenInfo.data.price;
  console.log(hourlyDividendsGenerated);
  let userDividendsPerHour = hourlyDividendsGenerated * supplyRatio;
  let userDividendsPerDay = 24 * userDividendsPerHour;
  let userDividendsPerWeek = 7 * 24 * userDividendsPerHour;
  let userDividendsPerMonth = 30 * 24 * userDividendsPerHour;

  document.querySelector("#estimation-hour").textContent = userDividendsPerHour.toFixed(2) + " " + dividendTokenInfo.data.symbol;
  document.querySelector("#estimation-day").textContent = userDividendsPerDay.toFixed(2) + " " + dividendTokenInfo.data.symbol;
  document.querySelector("#estimation-week").textContent = userDividendsPerWeek.toFixed(2) + " " + dividendTokenInfo.data.symbol;
  document.querySelector("#estimation-month").textContent = userDividendsPerMonth.toFixed(2) + " " + dividendTokenInfo.data.symbol;
}


function clearAccountInfo() {
  document.querySelector("#token-balance").textContent = "0";
  document.querySelector("#dividends-payed").textContent = "0";
  document.querySelector("#last-payment").textContent = "-";
  document.querySelector("#withdrawable-dividends").textContent = "-";
  document.querySelector("#auto-payment-bar").style.width = '0%';
  document.querySelector("#btn-claim").setAttribute("disabled", "disabled");
}


function clearCountdownInterval() {
  if (claimCountdownInterval != null) {
    clearInterval(claimCountdownInterval);
    claimCountdownInterval = null;
  }
}


function tokenToNumber(web3, amount) {
  return parseFloat(web3.utils.fromWei(amount, "ether"));
}


function dividendToNumber(web3, amount) {
  return parseFloat(web3.utils.fromWei(amount, "ether"));
}


// function dividendToStr(web3, amount, decimals) {
//   return dividendToNumber(web3, amount).toLocaleString(undefined, {maximumFractionDigits: decimals});
// }

function amountToStr(amount, decimals) {
  return amount.toLocaleString(undefined, {maximumFractionDigits: decimals});
}


/**
 * Fetch account data for UI when
 * - User switches accounts in wallet
 * - User switches networks in wallet
 * - User connects wallet initially
 */
async function refreshAccountData() {

  // If any current data is displayed when
  // the user is switching acounts in the wallet
  // immediate hide this data
  document.querySelector("#connected").style.display = "none";
  document.querySelector("#prepare").style.display = "block";

  // Disable buttons while UI is loading.
  // fetchAccountData() will take a while as it communicates
  // with Ethereum node via JSON-RPC and loads chain data
  // over an API call.
  document.querySelector("#btn-connect").setAttribute("disabled", "disabled");
  document.querySelector("#btn-disconnect").setAttribute("disabled", "disabled");
  document.querySelector("#btn-refresh").setAttribute("disabled", "disabled");
  document.querySelector("#btn-claim").setAttribute("disabled", "disabled");
  await fetchData(provider);
  document.querySelector("#btn-connect").removeAttribute("disabled");
  document.querySelector("#btn-disconnect").removeAttribute("disabled");
  document.querySelector("#btn-refresh").removeAttribute("disabled");
  document.querySelector("#btn-claim").removeAttribute("disabled");
}


/**
 * Connect wallet button pressed.
 */
async function onConnect() {
  // console.log("Opening a dialog", web3Modal);
  try {
    provider = await web3Modal.connect();

    web3 = new Web3(provider);
    // console.log("Web3 instance is", web3);

    contract = await initContract();
  } catch(e) {
    console.log("Could not get a wallet connection", e);
    return;
  }

  // Subscribe to accounts change
  provider.on("accountsChanged", async (accounts) => {
    contract = await initContract();
    await refreshAccountData();
  });

  // Subscribe to chainId change
  provider.on("chainChanged", async (chainId) => {
    contract = await initContract();
    await refreshAccountData();
  });

  await refreshAccountData();
}


async function onRefresh() {
  if (selectedAccount != null) {
    await refreshAccountData();
  }
}


async function onClaim() {
  document.querySelector("#btn-claim").setAttribute("disabled", "disabled");
  contract.methods.claim()
    .send()
    .then(function(resp) {
      //console.log(resp.transactionHash);
      return refreshAccountData();
    })
    .then(function() {

    });
}


/**
 * Disconnect wallet button pressed.
 */
async function onDisconnect() {
  if (selectedAccount == null) return;

  clearAccountInfo();

  // TODO: Which providers have close method?
  if(provider.close) {
    await provider.close();

    // If the cached provider is not cleared,
    // WalletConnect will default to the existing session
    // and does not allow to re-scan the QR code with a new wallet.
    // Depending on your use case you may want or want not his behavior.
    await web3Modal.clearCachedProvider();
    provider = null;
  }

  web3.eth.clearSubscriptions();

  selectedAccount = null;
  web3 = null;
  contract = null;

  clearCountdownInterval();

  // Set the UI back to the initial state
  document.querySelector("#prepare").style.display = "block";
  document.querySelector("#connected").style.display = "none";
  document.querySelector("#button-bar").style.display = "none";
}


/**
 * Main entry point.
 */
window.addEventListener('load', async () => {
  init();
  document.querySelector("#btn-connect").addEventListener("click", onConnect);
  document.querySelector("#btn-disconnect").addEventListener("click", onDisconnect);
  document.querySelector("#btn-refresh").addEventListener("click", onRefresh);
  document.querySelector("#btn-claim").addEventListener("click", onClaim);
});
