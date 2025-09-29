// --- Variables and Canvas Setup ---
const canvas = document.getElementById('roulette');
const ctx = canvas.getContext('2d');
const cx = canvas.width / 2;
const cy = canvas.height / 2;
const radius = 180;
let currentAngle = 0;
const sector = 2 * Math.PI / 37;
const europeanOrder = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6,
  27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29,
  7, 28, 12, 35, 3, 26
];
const colorMap = {
  0: 'green', 32: 'red', 15: 'black', 19: 'red', 4: 'black', 21: 'red', 2: 'black',
  25: 'red', 17: 'black', 34: 'red', 6: 'black', 27: 'red', 13: 'black', 36: 'red',
  11: 'black', 30: 'red', 8: 'black', 23: 'red', 10: 'black', 5: 'red', 24: 'black',
  16: 'red', 33: 'black', 1: 'red', 20: 'black', 14: 'red', 31: 'black', 9: 'red',
  22: 'black', 18: 'red', 29: 'black', 7: 'red', 28: 'black', 12: 'red', 35: 'black',
  3: 'red', 26: 'black'
};
const colors = europeanOrder.map(n => colorMap[n]);
const zeroOffset = europeanOrder.indexOf(0) * sector;

let selectedChip = 0.01;  // Nilai chip default 0.01 ETH
let bets = [];
let history = [];
let gamePhase = "WAITING";
let countdown = 10;
let roundTimer;
let resultMessageTimeout;

// --- Web3 / Wallet Variables ---
let provider, signer, userAddress = null;
let web3Modal;

// --- UI Elements ---
const statusEl = document.createElement("div");
statusEl.id = "game-status";
statusEl.style.fontSize = "20px";
statusEl.style.margin = "10px";
statusEl.style.fontWeight = "bold";
document.body.insertBefore(statusEl, canvas);

// Elemen untuk menampilkan saldo ETH
const ethBalanceEl = document.createElement("div");
ethBalanceEl.id = "eth-balance";
ethBalanceEl.style.fontSize = "18px";
ethBalanceEl.style.margin = "10px";
ethBalanceEl.style.fontWeight = "bold";
// Asumsikan elemen chip-selector sudah ada di HTML.
// Sisipkan saldo di atas chip-selector.
const chipSelectorEl = document.getElementById("chip-selector");
chipSelectorEl.parentElement.insertBefore(ethBalanceEl, chipSelectorEl);

const resultMessageEl = document.createElement("div");
resultMessageEl.id = "result-message";
resultMessageEl.style.fontSize = "18px";
resultMessageEl.style.fontWeight = "bold";
resultMessageEl.style.transition = "opacity 0.5s ease";
resultMessageEl.style.opacity = 0;
document.body.appendChild(resultMessageEl);

// --- Fungsi Update Saldo ETH ---
async function updateEthBalance() {
  if (provider && userAddress) {
    try {
      let balance = await provider.getBalance(userAddress);
      balance = ethers.utils.formatEther(balance);
      ethBalanceEl.textContent = `ETH Balance: ${balance} ETH`;
    } catch (error) {
      console.error("Failed to fetch balance:", error);
      ethBalanceEl.textContent = "ETH Balance: N/A";
    }
  } else {
    ethBalanceEl.textContent = "ETH Balance: -";
  }
}

// --- Canvas & Game Functions ---
function updateStatus(text) {
  statusEl.textContent = text;
}

function drawWheel(angle = 0) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 37; i++) {
    const start = angle + i * sector;
    const end = start + sector;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, end);
    ctx.fillStyle = colors[i];
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.stroke();
    
    const midAngle = start + sector / 2;
    const tx = cx + Math.cos(midAngle) * (radius - 30);
    const ty = cy + Math.sin(midAngle) * (radius - 30);
    ctx.fillStyle = 'white';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(europeanOrder[i], tx, ty);
  }
  
  // Center and pointer
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, 2 * Math.PI);
  ctx.fillStyle = 'white';
  ctx.fill();
  
  ctx.beginPath();
  ctx.moveTo(cx + radius + 10, cy);
  ctx.lineTo(cx + radius + 30, cy - 10);
  ctx.lineTo(cx + radius + 30, cy + 10);
  ctx.closePath();
  ctx.fillStyle = 'yellow';
  ctx.fill();
}

function startRound() {
  gamePhase = "BETTING";
  countdown = 10;
  updateStatus(`Place your bets... (${countdown})`);
  roundTimer = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(roundTimer);
      closeBetting();
    } else {
      updateStatus(`Place your bets... (${countdown})`);
    }
  }, 1000);
}

function closeBetting() {
  gamePhase = "CLOSED";
  updateStatus("Betting closed!");
  // Karena tiap bet sudah dikirim otomatis saat chip diletakkan,
  // kita tidak perlu menggabungkan transaksi di sini.
  setTimeout(() => spinWheel(), 1000);
}

function showResult(result) {
  updateHistory(result);
  
  // Tampilkan notifikasi hasil (hanya lokal)
  if (bets.length > 0) {
    const winAmount = evaluateBet(result);
    if (winAmount > 0) {
      displayNotification(`You win $${winAmount}!`);
    } else {
      displayNotification(`No win this round.`);
    }
  }
  
  clearBetsUI();
  bets = [];
  
  setTimeout(() => {
    updateStatus("Next round starting...");
    setTimeout(() => startRound(), 2000);
  }, 3000);
}

function spinWheel() {
  gamePhase = "SPINNING";
  updateStatus("Spinning...");
  const totalSpin = 360 * 5 + Math.random() * 360;
  const startAngle = currentAngle;
  const endAngle = startAngle + totalSpin * Math.PI / 180;
  const duration = 10000;
  const startTime = performance.now();
  
  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    currentAngle = startAngle + (endAngle - startAngle) * ease;
    drawWheel(currentAngle - zeroOffset);
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      const angleFromRight = (2 * Math.PI - (endAngle % (2 * Math.PI)) + zeroOffset) % (2 * Math.PI);
      const index = Math.floor(angleFromRight / sector);
      const result = europeanOrder[index];
      updateStatus(`Result: ${result}`);
      showResult(result);
    }
  }
  
  requestAnimationFrame(animate);
}

function clearBetsUI() {
  document.querySelectorAll('.bet-cell, .label, .side-label').forEach(cell => cell.classList.remove('selected'));
}

function evaluateBet(result) {
  let totalWin = 0;
  
  bets.forEach(bet => {
    if (bet.type === 'number' && bet.value === result) totalWin += bet.amount * 36;
    else if (bet.type === 'group') {
      if (bet.value === 'RED' && colorMap[result] === 'red') totalWin += bet.amount * 2;
      if (bet.value === 'BLACK' && colorMap[result] === 'black') totalWin += bet.amount * 2;
      if (bet.value === 'EVEN' && result !== 0 && result % 2 === 0) totalWin += bet.amount * 2;
      if (bet.value === 'ODD' && result % 2 === 1) totalWin += bet.amount * 2;
      if (bet.value === '1-18' && result >= 1 && result <= 18) totalWin += bet.amount * 2;
      if (bet.value === '19-36' && result >= 19 && result <= 36) totalWin += bet.amount * 2;
      if (bet.value === '1ST 12' && result >= 1 && result <= 12) totalWin += bet.amount * 3;
      if (bet.value === '2ND 12' && result >= 13 && result <= 24) totalWin += bet.amount * 3;
      if (bet.value === '3RD 12' && result >= 25 && result <= 36) totalWin += bet.amount * 3;
    } else if (bet.type === 'row') {
      const row1 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];
      const row2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
      const row3 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];
      if (bet.value === 'ROW 1' && row1.includes(result)) totalWin += bet.amount * 3;
      if (bet.value === 'ROW 2' && row2.includes(result)) totalWin += bet.amount * 3;
      if (bet.value === 'ROW 3' && row3.includes(result)) totalWin += bet.amount * 3;
    }
  });
  
  clearTimeout(resultMessageTimeout);
  resultMessageEl.style.opacity = 0;
  
  if (bets.length > 0) {
    resultMessageEl.textContent = totalWin > 0
      ? `You Won! $${totalWin}`
      : `You Lose.`;
    resultMessageEl.style.color = totalWin > 0 ? 'green' : 'red';
    void resultMessageEl.offsetWidth; // trigger reflow
    resultMessageEl.style.opacity = 1;
    resultMessageTimeout = setTimeout(() => {
      resultMessageEl.style.opacity = 0;
    }, 4000);
  } else {
    resultMessageEl.textContent = '';
    resultMessageEl.style.opacity = 0;
  }
  
  return totalWin;
}

function updateHistory(result) {
  const color = colorMap[result];
  history.unshift({ number: result, color });
  if (history.length > 10) history.pop();
  
  const historyDiv = document.getElementById('history');
  historyDiv.innerHTML = history.map(h => `
    <span class="history-item" style="background:${h.color};">${h.number}</span>
  `).join('');
}

// --- Chip Selection ---
// Pastikan nilai chip diambil sebagai angka desimal (gunakan parseFloat)
document.querySelectorAll('#chip-selector button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#chip-selector button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedChip = parseFloat(btn.dataset.value);
  });
});
// Set default chip ke 0.01 ETH
document.querySelector('#chip-selector button[data-value="0.01"]').classList.add('active');

// --- Grid Setup ---
// Setiap kali pemain mengklik sel taruhan, transaksi langsung dikirim.
const numberGrid = document.querySelector('.number-grid');
const columnOrder = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]
];

for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 12; col++) {
    const number = columnOrder[row][col];
    const cell = document.createElement('div');
    cell.className = `bet-cell ${colorMap[number]}`;
    cell.textContent = number;
    cell.addEventListener('click', () => {
      if (gamePhase === "BETTING") {
        const newBet = { type: 'number', value: number, amount: selectedChip };
        bets.push(newBet);
        cell.classList.add('selected');
        // Kirim transaksi taruhan otomatis untuk chip yang dipilih
        placeEthBet(selectedChip);
        updateStatus(`Placed bet of ${selectedChip} ETH on number ${number}`);
      }
    });
    numberGrid.appendChild(cell);
  }
}

document.querySelectorAll('.label-row .label').forEach(label => {
  label.addEventListener('click', () => {
    if (gamePhase === "BETTING") {
      const value = label.textContent.trim().toUpperCase();
      const newBet = { type: 'group', value, amount: selectedChip };
      bets.push(newBet);
      label.classList.add('selected');
      // Otomatis kirim taruhan
      placeEthBet(selectedChip);
      updateStatus(`Placed bet of ${selectedChip} ETH on ${value}`);
    }
  });
});

const zeroCell = document.querySelector('.zero-column .bet-cell');
zeroCell.addEventListener('click', () => {
  if (gamePhase === "BETTING") {
    const newBet = { type: 'number', value: 0, amount: selectedChip };
    bets.push(newBet);
    zeroCell.classList.add('selected');
    placeEthBet(selectedChip);
    updateStatus(`Placed bet of ${selectedChip} ETH on 0`);
  }
});

document.querySelectorAll('.side-label').forEach((label, index) => {
  label.addEventListener('click', () => {
    if (gamePhase === "BETTING") {
      const rowName = `ROW ${index + 1}`;
      const newBet = { type: 'row', value: rowName, amount: selectedChip };
      bets.push(newBet);
      label.classList.add('selected');
      placeEthBet(selectedChip);
      updateStatus(`Placed bet of ${selectedChip} ETH on ${rowName}`);
    }
  });
});

// --- Web3Modal & Wallet Integration ---
async function initWeb3Modal() {
  const providerOptions = {
    walletconnect: {
      package: window.WalletConnectProvider.default,
      options: {
        infuraId: "YOUR_INFURA_PROJECT_ID" // Ganti dengan Project ID dari Infura
      }
    }
  };
  
  web3Modal = new window.Web3Modal.default({
    cacheProvider: false,
    providerOptions,
  });
}

async function connectWallet() {
  try {
    const instance = await web3Modal.connect();
    provider = new ethers.providers.Web3Provider(instance);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    document.getElementById("wallet-status").textContent =
      `Connected: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
    // Update saldo ETH setelah wallet terkoneksi
    updateEthBalance();
  } catch (e) {
    console.error("Wallet connection failed", e);
  }
}

async function placeEthBet(amountInEth) {
  if (!signer || !userAddress) {
    updateStatus("Please connect your wallet.");
    return;
  }
  
  const tx = {
    to: "0xYourReceiverAddressHere", // Ganti dengan alamat penerima yang valid
    value: ethers.utils.parseEther(amountInEth.toString())
  };
  
  try {
    const txResponse = await signer.sendTransaction(tx);
    await txResponse.wait();
    updateStatus("Bet sent to blockchain!");
    // Setelah transaksi, perbarui saldo ETH
    updateEthBalance();
  } catch (err) {
    console.error(err);
    updateStatus("Transaction failed.");
  }
}

function displayNotification(message) {
  const notif = document.createElement("div");
  notif.className = "notification";
  notif.textContent = message;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 4000);
}

document.getElementById("connect-wallet").addEventListener("click", connectWallet);
initWeb3Modal();

// --- Init ---
drawWheel(-zeroOffset);
startRound();
