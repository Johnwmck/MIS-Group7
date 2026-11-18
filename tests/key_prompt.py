"""Interactive startup test in a pseudo-terminal, with only throwaway credentials/state."""
import os, pathlib, pty, select, signal, socket, subprocess, tempfile, time, urllib.request, json
ROOT=pathlib.Path(__file__).resolve().parents[1]
def run():
    with tempfile.TemporaryDirectory(prefix='team7-key-prompt-') as directory:
        root=pathlib.Path(directory); (root/'API').mkdir(); (root/'Client').mkdir()
        (root/'API/Team7Books.Api.csproj').write_text('<Project />'); (root/'Client/index.html').write_text('test')
        env=os.environ.copy()
        for key in list(env):
            if key.upper()=='MIS_LLM_KEY': del env[key]
        env.update(ASPNETCORE_ENVIRONMENT='Development',Bookstore__StatePath=str(root/'state.json'))
        secret='interactive-test-secret-not-real'
        def session(entry=None,save=None,cancel=False):
            with socket.socket() as s: s.bind(('127.0.0.1',0)); port=s.getsockname()[1]
            master,slave=pty.openpty()
            proc=subprocess.Popen(['dotnet',str(ROOT/'API/bin/Debug/net10.0/Team7Books.Api.dll'),'--urls',f'http://127.0.0.1:{port}'],cwd=root,env=env,stdin=slave,stdout=slave,stderr=slave,start_new_session=True)
            os.close(slave); output=bytearray()
            def wait_for(text):
                end=time.monotonic()+15
                while time.monotonic()<end:
                    ready,_,_=select.select([master],[],[],.1)
                    if ready:
                        try: output.extend(os.read(master,65536))
                        except OSError: break
                    if text.encode() in output: return
                    if proc.poll() is not None: break
                raise AssertionError('Expected startup state did not occur: '+text)
            try:
                if entry is not None or cancel:
                    wait_for('MIS API key (hidden):')
                    time.sleep(.1)
                    os.write(master,(entry or '').encode()+b'\r')
                    if cancel:
                        wait_for('Startup cancelled.'); proc.wait(timeout=5)
                        assert proc.returncode==1; return bytes(output)
                    wait_for('[y/N]:'); os.write(master,(save or 'n').encode()+b'\r')
                wait_for('Now listening on:')
                status=json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/api/assistant/status'))
                assert status['modelAvailable']
                assert secret.encode() not in output, 'Secret was echoed to the terminal'
                return bytes(output)
            finally:
                if proc.poll() is None:
                    proc.terminate()
                    try: proc.wait(timeout=5)
                    except subprocess.TimeoutExpired: proc.kill(); proc.wait()
                os.close(master)
        session(secret,'y')
        dotenv=root/'API/.env'
        assert secret in dotenv.read_text() and (dotenv.stat().st_mode & 0o777)==0o600
        print('PASS missing key pauses interactive startup, hidden entry enables provider, and optional save uses mode 0600')
        second=session()
        assert b'MIS API key (hidden):' not in second
        print('PASS existing dotenv key skips the terminal prompt on the next launch')
        dotenv.unlink(); session(cancel=True)
        assert not dotenv.exists()
        print('PASS empty key cancels startup without creating an environment file')
        session(secret,'n')
        assert not dotenv.exists()
        print('PASS process-only key works without persisting a file')
if __name__=='__main__': run()
