import '../src/index.css';
import '../src/App.css';
import Head from 'next/head';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>VCE Database</title>
        <meta
          name="description"
          content="Database of past VCE exam questions"
        />
        <link rel="icon" href={`${basePath}/favicon.png`} />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
