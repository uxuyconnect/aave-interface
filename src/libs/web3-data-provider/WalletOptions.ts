import { ChainId } from '@aave/contract-helpers';
import { SafeAppConnector } from '@gnosis.pm/safe-apps-web3-react';
import { AbstractConnector } from '@web3-react/abstract-connector';
import { UnsupportedChainIdError } from '@web3-react/core';
import { FrameConnector } from '@web3-react/frame-connector';
import { InjectedConnector } from '@web3-react/injected-connector';
import { TorusConnector } from '@web3-react/torus-connector';
import { ConnectorUpdate } from '@web3-react/types';
import { WalletLinkConnector } from '@web3-react/walletlink-connector';
import { getNetworkConfig } from 'src/utils/marketsAndNetworksConfig';

// import { LedgerHQFrameConnector } from 'web3-ledgerhq-frame-connector';
import { WalletConnectConnector } from './WalletConnectConnector';

export enum WalletType {
  INJECTED = 'injected',
  WALLET_CONNECT = 'wallet_connect',
  WALLET_LINK = 'wallet_link',
  TORUS = 'torus',
  UXUY = 'uxuy',
  FRAME = 'frame',
  GNOSIS = 'gnosis',
  LEDGER = 'ledger',
  READ_ONLY_MODE = 'read_only_mode',
}

const APP_NAME = 'Aave';
const APP_LOGO_URL = 'https://aave.com/favicon.ico';

const mockProvider = {
  request: Promise.resolve(null),
};

/**
 *  This is a connector to be used in read-only mode.
 *  On activate, the connector expects a local storage item called `readOnlyModeAddress` to be set, otherwise an error is thrown.
 *  When the connector is deactivated (i.e. on disconnect, switching wallets), the local storage item is removed.
 */
export class ReadOnlyModeConnector extends AbstractConnector {
  readAddress = '';

  activate(): Promise<ConnectorUpdate<string | number>> {
    const address = localStorage.getItem('readOnlyModeAddress');
    if (!address || address === 'undefined') {
      throw new Error('No address found in local storage for read-only mode');
    }

    this.readAddress = address;

    return Promise.resolve({
      provider: mockProvider,
      chainId: ChainId.mainnet,
      account: this.readAddress,
    });
  }
  getProvider(): Promise<unknown> {
    return Promise.resolve(mockProvider);
  }
  getChainId(): Promise<string | number> {
    return Promise.resolve(ChainId.mainnet);
  }
  getAccount(): Promise<string | null> {
    return Promise.resolve(this.readAddress);
  }
  deactivate(): void {
    const storedReadAddress = localStorage.getItem('readOnlyModeAddress');
    if (storedReadAddress === this.readAddress) {
      // Only update local storage if the address is the same as the one this connector stored.
      // This will be different if the user switches to another account to observe because
      // the new connector gets initialized before this one is deactivated.
      localStorage.removeItem('readOnlyModeAddress');
    }
  }
}

interface UxuyConnectorArguments {
  chainId: number;
  initOptions?: any;
  constructorOptions?: any;
}

export interface ProviderRpcError extends Error {
  message: string;
  code: number;
  data?: unknown;
}

export class UxuyConnector extends AbstractConnector {
  private readonly chainId: number;
  //private readonly initOptions: any;
  private readonly constructorOptions: any;

  public uxuy: any;

  constructor({ chainId, constructorOptions = {} }: UxuyConnectorArguments) {
    super({
      supportedChainIds: [1, 56, 8453, 42161, 137, 250, 10, 43114, 324, 59144, 1116, 810180],
    });

    this.chainId = chainId;
    //this.initOptions = initOptions;
    this.constructorOptions = constructorOptions;
  }

  public async activate(): Promise<ConnectorUpdate> {
    if (!this.uxuy) {
      const Uxuy = await import('@uxuycom/web3-tg-sdk').then((m) => m?.default ?? m);
      this.uxuy = new Uxuy['WalletTgSdk'](this.constructorOptions);
      //await this.uxuy.init(this.initOptions);
    }

    let accounts = await this.uxuy.ethereum.request({ method: 'eth_accounts' });

    if (!accounts[0]) {
      await this.uxuy.ethereum.request({ method: 'eth_requestAccounts' });
    }

    accounts = await this.uxuy.ethereum.request({ method: 'eth_accounts' });

    // Set up event listeners for account and chain changes
    this.uxuy.ethereum.removeAllListeners();
    this.uxuy.ethereum.on('accountsChanged', (accounts: any) => {
      console.log('Active account changed:', accounts[0]);
    });
    this.uxuy.ethereum.on('chainChanged', async (changedChainId: any) => {
      console.log('Network changed to:', changedChainId);
      this.emitUpdate({ chainId: changedChainId, provider: this.uxuy.ethereum });
    });

    return { provider: this.uxuy.ethereum, account: accounts[0] };
  }

  public async getProvider(): Promise<any> {
    return this.uxuy.ethereum;
  }

  public async getChainId(): Promise<number | string> {
    return this.chainId;
  }

  public async getAccount(): Promise<null | string> {
    return this.uxuy.ethereum
      .request({ method: 'eth_accounts' })
      .then((accounts: string[]): string => accounts[0]);
  }

  public async deactivate() {}

  public async close() {
    this.uxuy.ethereum.removeAllListeners();
    this.uxuy = undefined;
    this.emitDeactivate();
  }
}


export const getWallet = (
  wallet: WalletType,
  chainId: ChainId = ChainId.mainnet,
  currentChainId: ChainId = ChainId.mainnet
): AbstractConnector => {
  switch (wallet) {
    case WalletType.READ_ONLY_MODE:
      return new ReadOnlyModeConnector();
    // case WalletType.LEDGER:
    //   return new LedgerHQFrameConnector({});
    case WalletType.INJECTED:
      return new InjectedConnector({});
    case WalletType.WALLET_LINK:
      const networkConfig = getNetworkConfig(chainId);
      return new WalletLinkConnector({
        appName: APP_NAME,
        appLogoUrl: APP_LOGO_URL,
        url: networkConfig.privateJsonRPCUrl || networkConfig.publicJsonRPCUrl[0],
      });
    case WalletType.WALLET_CONNECT:
      return new WalletConnectConnector(currentChainId);
    case WalletType.GNOSIS:
      if (window) {
        return new SafeAppConnector();
      }
      throw new Error('Safe app not working');
    case WalletType.TORUS:
      return new TorusConnector({
        chainId,
        initOptions: {
          network: {
            host: chainId === ChainId.polygon ? 'matic' : chainId,
          },
          showTorusButton: false,
          enableLogging: false,
          enabledVerifiers: false,
        },
      });

    case WalletType.UXUY:
      return new UxuyConnector({
        chainId,
        constructorOptions: {},
        initOptions: {
          network: {
            host: chainId === ChainId.polygon ? 'matic' : chainId,
          },
          enableLogging: false,
          enabledVerifiers: false,
        },
      });

    case WalletType.FRAME: {
      if (chainId !== ChainId.mainnet) {
        throw new UnsupportedChainIdError(chainId, [1]);
      }
      return new FrameConnector({ supportedChainIds: [1] });
    }
    default: {
      throw new Error(`unsupported wallet`);
    }
  }
};
