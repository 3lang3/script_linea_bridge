import { ContractReceipt, ethers } from "ethers"
import { parseArgs } from "node:util";
import { ensureCacheExsit, getTxtContent, readReceipt, resetCache, saveReceipt, task } from "./utils";
import path from "node:path";

const {
  values: args,
} = parseArgs({
  options: {
    env: {
      type: "string",
      short: "e",
      default: '',
    },
    action: {
      type: "string",
      short: "a",
      default: '',
    },
    /** 数量 */
    num: {
      type: "string",
      short: "n",
      default: '',
    },
  },
});

const runtime = args.env || 'prod';

const L1_TO_L2_CONTRAC_ADDR = {
  prod: '0xd19d4B5d358258f05D7B411E21A1460D11B0876F',
  test: '0x70BaD09280FD342D02fe64119779BC1f0791BAC2'
}[runtime];

const L2_TO_L1_CONTRAC_ADDR = {
  prod: '0x508Ca82Df566dCD1B0DE8296e70a96332cD644ec',
  test: '0xC499a572640B64eA1C8c194c43Bc3E19940719dC'
}[runtime];

const rpc = {
  mainnet: {
    prod: 'https://ethereum.rpc.thirdweb.com',
    test: 'https://goerli.rpc.thirdweb.com'
  }[runtime],
  linea: {
    prod: 'https://linea.rpc.thirdweb.com',
    test: 'https://linea-testnet.rpc.thirdweb.com'
  }[runtime]
}

const mainnetProvider = new ethers.providers.JsonRpcProvider(rpc.mainnet);
const lineaProvider = new ethers.providers.JsonRpcProvider(rpc.linea);

const formatEther = (value: ethers.BigNumberish, len = 4) => {
  return +(+ethers.utils.formatEther(value)).toFixed(len);
}

// 计算跨链执行费用
// https://docs.linea.build/use-mainnet/bridges-of-linea#what-are-the-execution-fees
const getL1ToL2EcutionFee = async () => {
  const margin = ethers.BigNumber.from(2);
  const gasEstimated = ethers.BigNumber.from(106000);
  const targetLayerGasPrice = await lineaProvider.getGasPrice();
  return targetLayerGasPrice.mul(gasEstimated).mul(margin);
}

// L1 -> L2
const brigdeToLinea = async (pk: string, _amount: string) => {
  const signer = new ethers.Wallet(pk, mainnetProvider);

  await task('to_linea', signer, async () => {
    const ecutionFee = await getL1ToL2EcutionFee();
    const value = ethers.utils.parseEther(_amount).add(ecutionFee);
    const balance = await signer.getBalance();
    if (balance.lt(value)) {
      throw new Error(`余额不足，需要${formatEther(value)}，实际${formatEther(balance)}`);
    }
    const abi = ['function sendMessage(address _to, uint256 _value, bytes _data) payable']
    const contract = new ethers.Contract(L1_TO_L2_CONTRAC_ADDR, abi, signer);
    const tx = await contract.sendMessage(signer.address, ecutionFee, '0x', { value });
    const receipt: ContractReceipt = await tx.wait();
    const gasCost = receipt.effectiveGasPrice.mul(receipt.gasUsed);
    console.log(`跨链完成, Gas消耗:${formatEther(gasCost)}, tx:${receipt.transactionHash}`);
  })
}

// L2 -> L1
const brigdeToMainnet = async (pk: string, _amount: string) => {
  const signer = new ethers.Wallet(pk, lineaProvider);
  await task('to_mainnet', signer, async () => {
    const ecutionFee = ethers.utils.parseEther('0.01');
    const value = ethers.utils.parseEther(_amount).add(ecutionFee);
    const balance = await signer.getBalance();
    if (balance.lt(value)) {
      throw new Error(`余额不足，需要${formatEther(value)}，实际${formatEther(balance)}`);
    }
    const abi = [
      'function sendMessage(address _to, uint256 _value, bytes _data) payable',
    ]
    const contract = new ethers.Contract(L2_TO_L1_CONTRAC_ADDR, abi, signer);
    const nonce = await signer.getTransactionCount();
    const gasPrice = await signer.getGasPrice();
    const modifyGasPrice = gasPrice.add(ethers.utils.parseUnits('10', 'gwei'));
    const tx = await contract.sendMessage(signer.address, ecutionFee, '0x', {
      value,
      nonce,
      maxFeePerGas: modifyGasPrice,
      maxPriorityFeePerGas: modifyGasPrice
    });
    const receipt: ContractReceipt = await tx.wait();
    const gasCost = receipt.effectiveGasPrice.mul(receipt.gasUsed);
    console.log(`跨链完成, Gas消耗:${formatEther(gasCost)}, tx:${receipt.transactionHash}`);
    saveReceipt(receipt);
  })
}

// L2跨到L1需要手动claimMessage
const claimMessage = async (pk: string) => {
  const signer = new ethers.Wallet(pk, mainnetProvider);
  await task('claim', signer, async () => {
    const record = await readReceipt(signer.address);
    if (!record) {
      throw new Error(`未找到${signer.address}的跨链记录`);
    }
    const abicoder = ethers.utils.defaultAbiCoder;
    const [fee, value, nonce] = abicoder.decode(['uint256', 'uint256', 'uint256', 'bytes'], record.logs[0].data);
    const abi = [
      'function claimMessage(address _from, address _to, uint256 _fee, uint256 _value, address _feeRecipient, bytes _calldata, uint256 _nonce)',
    ];
    const contract = new ethers.Contract(L1_TO_L2_CONTRAC_ADDR, abi, signer);
    const tx = await contract.claimMessage(
      signer.address,
      signer.address,
      fee,
      value,
      ethers.constants.AddressZero,
      '0x',
      nonce,
    );
    const receipt: ContractReceipt = await tx.wait();
    const gasCost = receipt.effectiveGasPrice.mul(receipt.gasUsed);
    console.log(`claimMessage完成, Gas消耗:${formatEther(gasCost)}, tx:${receipt.transactionHash}`);
  }, {
    dependies: ["to_mainnet"]
  })
}


const main = async () => {
  const addresses = getTxtContent(path.join(__dirname, './pks.txt'));
  if (!args.action) {
    throw new Error('❌ action参数不能为空');
  }
  if (args.action === 'reset') {
    resetCache();
    return;
  }

  if (args.env === 'test') {
    console.log(`[info]🤖当前环境为测试网`);
  }

  console.log(`[info]🤖内置任务缓存，如果任务失败，可以重新执行，已执行的不会重复执行`)
  
  for (let index = 0; index < addresses.length; index++) {
    const element = addresses[index];
    const wallet = new ethers.Wallet(element);
    try {
      ensureCacheExsit()
      if (args.action === 'to_linea') {
        if (!args.num) {
          throw new Error('❌ num参数不能为空');
        }
        await brigdeToLinea(element, args.num);
      }
      if (args.action === 'to_mainnet') {
        if (!args.num) {
          throw new Error('❌ num参数不能为空');
        }
        await brigdeToMainnet(element, args.num);
      }
      if (args.action === 'claim') {
        await claimMessage(element);
      }
    } catch (error) {
      console.log(`❌[${wallet.address}]error: ${error?.reason || error?.message}`)
    }
  }
}

main().catch(console.error)