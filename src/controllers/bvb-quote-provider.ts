import axios from 'axios';
import querystring from 'querystring';

import { Dictionary } from '../models/dictionary';
import { Asset, AssetType, AssetTypeNotSupportedError, parseSymbol, QuoteProvider } from './quote-provider';

/**
 * Provide bond and stock quotes from Bursa de Valori Bucuresti (RO)
 */
export class BVBQuoteProvider implements QuoteProvider {

  async getStockQuotes(symbols: string[]): Promise<Asset[]> {
    return this.getAssetQuotes(symbols, AssetType.STOCK);
  }

  async getBondQuotes(symbols: string[]): Promise<Asset[]> {
    return this.getAssetQuotes(symbols, AssetType.BOND);
  }

  getCommodityQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.COMMODITY);
  }

  getCryptoCurrencyQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  getForexQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.COMMODITY);
  }

  getMutualFundQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  getSupportedMarkets(): string[] {
    return ['BVB', 'AERO', 'XBSE'];
  }

  getId(): string {
    return 'BVB';
  }

  private getInputValue(name: string, htmlBody: string): string {
    const pattern = new RegExp('name="' + name + '"[^>]+value="([^"]+)');
    const match = pattern.exec(htmlBody);
    if (match) {
      return match[1];
    } else {
      return '';
    }

  }

  private async getAssetQuotes(symbols: string[], assetType: AssetType): Promise<Asset[]> {
    const mainSegmentSymbols: string[] = [];
    const aeroSymbols: string[] = [];
    for (const fullSymbol of symbols) {
      const symbolParts = parseSymbol(fullSymbol);
      if (symbolParts.marketCode === 'AERO') {
        aeroSymbols.push(fullSymbol);
      } else {
        mainSegmentSymbols.push(fullSymbol);
      }

    }
    const promises: Array<Promise<Asset[]>> = [];
    if (mainSegmentSymbols.length > 0) {
      promises.push(this.getSegmentAssetQuotes(mainSegmentSymbols, assetType, ''));
    }
    if (aeroSymbols.length > 0) {
      promises.push(this.getSegmentAssetQuotes(aeroSymbols, assetType, 'AERO'));
    }
    const results = await Promise.all(promises);
    let quotes: Asset[] = [];
    for (const assets of results) {
      quotes = quotes.concat(assets);
    }
    return quotes;
  }

  /**
   * Return quotes from both main and AERO market segments
   * @param symbols list of symbols to return quote for
   * @param assetType the type of symbols passed (stock or bonds)
   * @param segmentId the market segment identifier (can be blank for main segment or AERO)
   */
  private async getSegmentAssetQuotes(symbols: string[], assetType: AssetType, segmentId: string): Promise<Asset[]> {
    let url;
    if (assetType === AssetType.BOND) {
      url = 'http://bvb.ro/FinancialInstruments/Markets/Bonds';
    } else {
      url = 'http://bvb.ro/FinancialInstruments/Markets/Shares';
    }

    let response = await axios.get(url);
    let htmlBody = response.data;
    if (segmentId === 'AERO') {
      const viewState = this.getInputValue('__VIEWSTATE', htmlBody);
      const eventValidation = this.getInputValue('__EVENTVALIDATION', htmlBody);
      const viewStateGenerator = this.getInputValue('__VIEWSTATEGENERATOR', htmlBody);
      const postData = querystring.stringify({
        __ASYNCPOST: 'true',
        __EVENTARGUMENT: '',
        __EVENTTARGET: 'ctl00$ctl00$body$rightColumnPlaceHolder$TabsControlPiete$lb1',
        __EVENTVALIDATION: eventValidation,
        __LASTFOCUS: '',
        __VIEWSTATE: viewState,
        __VIEWSTATEGENERATOR: viewStateGenerator,
        ctl00$ctl00$MasterScriptManager: 'tl00$ctl00$MasterScriptManager|ctl00$ctl00$body$rightColumnPlaceHolder$TabsControlPiete$lb1',
        ctl00$ctl00$body$rightColumnPlaceHolder$ddlTier: '999',
        gv_length: '10',
      });
      response = await axios.post(url, postData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.80 Safari/537.36',
        },
      });
      htmlBody = response.data;
    }

    const symbolsMap: Dictionary<string> = {};
    for (const fullSymbol of symbols) {
      const symbolParts = parseSymbol(fullSymbol);
      symbolsMap[symbolParts.shortSymbol] = fullSymbol;

    }

    // extract quote
    const regex = new RegExp('\/FinancialInstrumentsDetails\.aspx\?s=([^"&]+)[^>]*><strong>[^<]*<\/strong><\/a><p[^>]*>([^<]+)<\/p>' +
      '\s*<\/td><td[^>]*>[^<]*<\/td><td[^>]*>\s*([0-9,.]+)', 'g');
    const result: Asset[] = [];
    let match = regex.exec(htmlBody);
    while (match) {
      let userSymbol: string;
      if (symbolsMap[match[1]]) {
        userSymbol = symbolsMap[match[1]];
      } else if (symbolsMap[match[2]]) {
        userSymbol = symbolsMap[match[2]];
      }
      if (userSymbol) {
        const price = match[3];
        result.push({
          currency: 'RON',
          percentPrice: assetType === AssetType.BOND,
          price: +price,
          symbol: userSymbol,
        });
      }

      match = regex.exec(htmlBody);
    }
    return result;
  }

}

// register as quote provider
export const bvbQuoteProvider = new BVBQuoteProvider();
