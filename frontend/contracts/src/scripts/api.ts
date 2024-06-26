import {
    createPublicClient,
    createWalletClient,
    custom,
    parseAbiItem,
    encodeFunctionData,
    WalletClient,
    decodeEventLog,
    Log
} from 'viem'
import {sepolia} from 'viem/chains'

import abi from '../../lib/PoEMarketplace_abi.json'

const CONTRACT = '0x7C3c3cEFAde338Bb4461d365ed5B1955A944F2cD'

const publicClient = createPublicClient({
    chain: sepolia,
    transport: custom((window as any).ethereum)
})

const client = createWalletClient({
    chain: sepolia,
    transport: custom((window as any).ethereum)
})

export const walletClient = createWalletClient({
    chain: sepolia,
    transport: custom((window as any).ethereum)
})


// generic function to write to the contract and return tx hash
const writeContract = async (walletClient: WalletClient,   functionName: string, args: any[], value: bigint) => {
    const [account] = await walletClient.getAddresses()
    const {request} = await publicClient.simulateContract({
        account,
        address: CONTRACT as `0x${string}`,
        abi: abi,
        functionName: functionName,
        args: args || [0],
        value
    })
    return await walletClient.writeContract(request)
}

// watches for the TokenPurchased event emitted during the purchaseToken function call. 
// This will be used to trigger the redeem function call.
export const unwatchPurchase = publicClient.watchEvent({
    address: CONTRACT as `0x${string}`,
    event: parseAbiItem('event TokenPurchased(uint256 indexed id, address indexed buyer)'),
    // TO DO - call function with logs to derive public key https://viem.sh/docs/utilities/recoverPublicKey#recoverpublickey
    onLogs: logs => console.log(logs)
})

// watches for the TokenPurchased event emitted during the purchaseToken function call. 
// This will be used to trigger the redeem function call.
export const unwatchRedeem = publicClient.watchEvent({
    address: CONTRACT as `0x${string}`,
    event: parseAbiItem('event ExploitRedeemed(uint256 indexed id, address indexed buyer)'),
    // TO DO - call function with logs to derive public key https://viem.sh/docs/utilities/recoverPublicKey#recoverpublickey
    onLogs: logs => console.log(logs)
})

// uses the logs emitted from watch functions 
export const parseEventLogs = (logs: Log[]) => logs
    .filter(log => log.address.toLowerCase() === CONTRACT.toLowerCase())
    .map(log => decodeEventLog({
        abi: abi,
        data: log.data,
        topics: log.topics
    }))
    .find(decodedLog => decodedLog.eventName === 'TokenPurchased' || decodedLog.eventName === 'ExploitRedeemed')

// After a token is purchased, the buyer's address is used by the seller to compute the proofs
export const getBuyerAddressFromTokenPurchasedEvent = (tokenPurchasedLog: Log) => (tokenPurchasedLog as any).args.buyer

// After an Exploit is redeemed, the buyer must obtain a) the seller's public key from the signature of the redeem transaction,
// this is handled off-chain, and b) the shared key cipher from the contract, by calling the retrieveSharedKeyCipher function below.

// A White Hat Hacker can post an exploit to the marketplace
export const postExploit = async (walletClient: WalletClient, description: string, price: bigint, hash: bigint) => await writeContract(walletClient, 'postExploit', [description, price, hash], BigInt(2))

// A vendor can purchase the exploit token from the marketplace
export const purchaseToken = async (walletClient: WalletClient, tokenId: number) => await writeContract(walletClient, 'purchaseToken', [tokenId], BigInt(tokenId))

// The White Hat Hacker uses the vendor's public key derived from the purchaseToken transaction to compute the proofs and receive the payment
//export const redeem = async (walletClient: WalletClient, tokenId: number, key: bigint) => await writeContract(walletClient, 'redeemExploit', [tokenId, key])

// Finally, the vendor can retrieve the shared key from the exploit token
export const retrieveSharedKeyCipher = async (tokenId: number) => publicClient.readContract({
    address: CONTRACT as `0x${string}`,
    abi: abi,
    functionName: 'getExploitKey',
    args: [tokenId]
})

// The White Hat computes proofs, then calls the redeem function with the token ID (exploit ID) and the shared key.
// Returns the transaction hash and the signature to derive the public key, which will be provdied via the front end to the buyer.
// The buyer will then call the retrieveKey function, and use the retrieved sharedKeyCipher and the public key to decrypt the shared key
// via the 'decryptEcdhChacha20' function in the frontend/src/utils/decrypt.ts file.
export const redeemSigned = async (tokenId: number, key: bigint) => {
    const data = encodeFunctionData({
        abi: abi,
        functionName: 'redeemExploit',
        args: [tokenId, key]
    })

    const [account] = await walletClient.getAddresses()
    const request = await client.prepareTransactionRequest({
        account,
        to: CONTRACT as `0x${string}`,
        value: 0n,
        data: data
    })

    const signature = await client.signTransaction(request as any)
    const txHash = await client.sendRawTransaction(signature as any)

    return {txHash, signature}
}