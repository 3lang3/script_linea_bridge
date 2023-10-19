import { ethers } from "ethers";
import path from "path";
import abi from "./abi";
import { getTxtContent } from "./utils";

const RPC_LINEA = "https://rpc.goerli.linea.build";
const provider = new ethers.providers.JsonRpcProvider(RPC_LINEA);
// 空投合约地址
const AIRDROP_ADDR = "0x814D2E1A74C0Ed22264556b7226C454C69c56836";

// 空投钱包私钥
const privateKey = "";
// 每个地址空投eth数量
const amount = "0.01"; // eth;

const airdropEth = async (pks: string[]) => {
  while (true) {
    try {
      const signer = new ethers.Wallet(privateKey, provider);
      const contract = new ethers.Contract(AIRDROP_ADDR, abi, signer);
      const addresses = pks.map(el =>  new ethers.Wallet(el).address)
      const amounts = addresses.map(() => ethers.utils.parseEther(amount));
      const amountTotal = amounts.reduce(
        (a, b) => a.add(b),
        ethers.BigNumber.from(0)
      );

      const balnace = await signer.getBalance();
      console.log(
        `需要${ethers.utils.formatEther(
          amountTotal
        )}eth，当前余额${ethers.utils.formatEther(balnace)}eth`
      );

      if (balnace.lt(amountTotal)) {
        throw Error(`余额不足`);
      }
      const feeData = await provider.getFeeData();
      const maxFeePerGas = feeData.gasPrice.add(
        ethers.utils.parseUnits("5", "gwei")
      );
      const maxPriorityFeePerGas = maxFeePerGas.sub(
        ethers.utils.parseUnits("1", "wei")
      );
      const gasLimit = await contract.estimateGas.multiTransferETH(
        addresses,
        amounts,
        { value: amountTotal }
      );
      const nonce = await signer.getTransactionCount();
      const tx: ethers.ContractTransaction = await contract.multiTransferETH(
        addresses,
        amounts,
        {
          value: amountTotal,
          nonce,
          gasLimit,
          maxFeePerGas,
          maxPriorityFeePerGas,
        }
      );
      console.log("调用成功，等待链上确认", tx.hash);
      await tx.wait();
      console.log("空投完成");
      break;
    } catch (error) {
      console.log(`空投出错: ${error.message}`);
    }
  }
};

const main = async () => {
  if (!privateKey) throw Error("请填写私钥");
  if (!amount) throw Error("请填写单号空投金额");
  const pks = getTxtContent(path.join(__dirname, "./pks.txt"));
  if (!pks?.length) throw Error("未发现需要空投的钱包私钥");
  console.log(`🤖 共${pks.length}个地址, 每个地址空投${amount}eth`);
  while (pks.length) {
    // 一次空投最多200个地址，分组空投
    const arr = pks.splice(0, 200);
    await airdropEth(arr);
  }
};

main().catch(console.error);
