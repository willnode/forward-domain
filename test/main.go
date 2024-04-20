package main

import (
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

func main() {
	// Get the current working directory.
	currentDir, err := os.Getwd()
	if err != nil {
		fmt.Println("Error:", err)
		return
	}

	// Get the parent directory.
	parentDir := filepath.Dir(currentDir)

	dns := exec.Command("dnsserver")
	dns.Stderr = os.Stderr
	// dns.Stdout = os.Stdout

	err = dns.Start()
	if err != nil {
		fmt.Println("Server Error:", err)
		os.Exit(1)
	}

	chall := exec.Command("pebble", "-dnsserver", "127.0.0.1:1053", "-config", "pebble-config.json")
	chall.Stderr = os.Stderr
	chall.Stdout = os.Stdout
	chall.Env = append(chall.Env, "PEBBLE_WFE_NONCEREJECT=0")

	err = chall.Start()
	if err != nil {
		fmt.Println("Server Error:", err)
		os.Exit(1)
	}

	time.Sleep(time.Millisecond * 1000)

	serv := exec.Command("node", "--env-file=.env.test", "app.js")
	serv.Env = os.Environ()
	serv.Env = append(serv.Env, "NODE_EXTRA_CA_CERTS=test/certs/pebble.minica.pem")
	serv.Dir = parentDir
	serv.Stderr = os.Stderr
	serv.Stdout = os.Stdout

	err = serv.Start()
	if err != nil {
		fmt.Println("Server Error:", err)
		os.Exit(1)
	}

	time.Sleep(time.Millisecond * 5000)

	err = test()

	time.Sleep(time.Millisecond * 1000)

	serv.Process.Kill()
	dns.Process.Kill()
	exec.Command("killall", "pebble").Run()
	if err != nil {
		fmt.Println("Test Error:", err)
		os.Exit(1)
	}

	fmt.Println("Test Successfull!!!!")
	os.Exit(0)
}

func test() error {
	url := "http://localhost:8880/hello"

	tr := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: true,
			ServerName:         "r.forwarddomain.net",
		},
	}
	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
		Transport: tr,
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}

	req.Host = "r.forwarddomain.net"
	req.Header.Add("accept", "text/plain")
	req.Header.Add("user-agent", "test")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	bodyString := string(bodyBytes)
	fmt.Println(bodyString)

	if resp.StatusCode != 302 {
		return fmt.Errorf("expected status code 302, got %d", resp.StatusCode)
	}

	location, ok := resp.Header["Location"]
	if !ok || location[0] != "https://forwarddomain.net/hello" {
		return fmt.Errorf("expected header Location to be 'https://forwarddomain.net/hello', got %s", location[0])
	}

	url = "https://localhost:8843/hello"

	req, err = http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	req.Host = "r.forwarddomain.net"
	req.Header.Add("accept", "text/plain")
	req.Header.Add("user-agent", "test")

	resp, err = client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 302 {
		return fmt.Errorf("expected status code 302, got %d", resp.StatusCode)
	}

	location, ok = resp.Header["Location"]
	if !ok || location[0] != "https://forwarddomain.net/hello" {
		return fmt.Errorf("expected header Location to be 'https://forwarddomain.net/hello', got %s", location[0])
	}

	// second time: check reuse
	resp, err = client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 302 {
		return fmt.Errorf("expected status code 302 on reuse, got %d", resp.StatusCode)
	}

	return nil
}
