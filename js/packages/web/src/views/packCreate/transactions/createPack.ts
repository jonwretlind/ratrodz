import {
  MAX_PACK_SET_SIZE,
  sendTransactions,
  SequenceType,
} from '@oyster/common';
import { Keypair, TransactionInstruction } from '@solana/web3.js';
import { WalletNotConnectedError } from '@solana/wallet-adapter-base';
import { programIds } from '@oyster/common';

import { CreatePackParams } from './interface';
import { getInitPackSet } from './getInitPackSet';
import { getCreateAccount } from './getCreateAccount';
import { getAddCardToPack } from './getAddCardToPack';
import { mapSelectedItems, mapSelectedVouchers } from '../utils';
import { getAddVoucherToPack } from './getAddVoucherToPack';
import { getActivate } from './getActivate';
import { getCreateTokenAccounts } from './getCreateTokenAccounts';

const generateCreatePackInstructions = async ({
  wallet,
  connection,
  accountByMint,
  data,
}: CreatePackParams): Promise<{
  instructions: TransactionInstruction[][];
  signers: Keypair[][];
}> => {
  if (!wallet.publicKey) throw new WalletNotConnectedError();

  const packSet = Keypair.generate();

  if (!packSet.publicKey) new Error('No packSet key');

  const walletPublicKey = wallet.publicKey;
  const packSetKey = packSet.publicKey;

  const createAccountInstruction = await getCreateAccount({
    connection,
    walletPublicKey,
    newAccountPubkey: packSetKey,
    space: MAX_PACK_SET_SIZE,
    programId: programIds().pack_create,
  });

  const initPackSetInstruction = await getInitPackSet({
    data,
    walletPublicKey,
    packSetKey,
  });

  const {
    selectedVouchers,
    selectedItems,
    supplyByMetadataKey,
    weightByMetadataKey,
    distributionType,
  } = data;

  const cardsToAdd = mapSelectedItems({
    selectedItems,
    supplyByMetadataKey,
    weightByMetadataKey,
    accountByMint,
    distributionType,
  });
  // Create accounts for token transfer
  const createTokenAccountsInstructions = await getCreateTokenAccounts({
    cardsToAdd,
    connection,
    walletPublicKey,
  });
  const addCardToPackInstructions = await getAddCardToPack({
    selectedItems: cardsToAdd,
    walletPublicKey,
    packSetKey,
  });

  const vouchersToAdd = mapSelectedVouchers({
    selectedVouchers,
    accountByMint,
  });
  const addVoucherToPackInstructions = await getAddVoucherToPack({
    selectedVouchers: vouchersToAdd,
    walletPublicKey,
    packSetKey,
  });

  const activateInstruction = await getActivate({
    walletPublicKey,
    packSetKey,
  });

  const cardsTokens = cardsToAdd.map(({ toAccount }) => toAccount);

  return {
    instructions: [
      [createAccountInstruction, initPackSetInstruction],
      createTokenAccountsInstructions,
      addCardToPackInstructions,
      addVoucherToPackInstructions,
      [activateInstruction],
    ],
    signers: [[packSet], cardsTokens, [], [], []],
  };
};

export const sendCreatePack = async ({
  wallet,
  connection,
  accountByMint,
  data,
}: CreatePackParams) => {
  const { instructions, signers } = await generateCreatePackInstructions({
    wallet,
    connection,
    accountByMint,
    data,
  });

  return sendTransactions(
    connection,
    wallet,
    instructions,
    signers,
    SequenceType.Sequential,
  );
};
