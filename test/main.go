package main

import (
	"fmt"
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
	dns.Stdout = os.Stdout

	err = dns.Start()
	if err != nil {
		fmt.Println("Server Error:", err)
		os.Exit(1)
	}

	chall := exec.Command("pebble", "-dnsserver", "127.0.0.1:1053")
	chall.Stderr = os.Stderr
	chall.Stdout = os.Stdout

	err = chall.Start()
	if err != nil {
		fmt.Println("Server Error:", err)
		os.Exit(1)
	}

	time.Sleep(time.Millisecond * 1000)

	serv := exec.Command("node", "--env-file=.env.test", "app.js")
	serv.Dir = parentDir
	serv.Stderr = os.Stderr
	serv.Stdout = os.Stdout

	err = serv.Start()
	if err != nil {
		fmt.Println("Server Error:", err)
		os.Exit(1)
	}

	time.Sleep(time.Millisecond * 5000)

	cmd := exec.Command("bun", "test", "--timeout", "60000")
	cmd.Dir = parentDir
	cmd.Stderr = os.Stderr
	cmd.Stdout = os.Stdout

	err = cmd.Run()

	time.Sleep(time.Millisecond * 1000)

	serv.Process.Kill()
	dns.Process.Kill()
	exec.Command("killall", "pebble").Run()
	if err != nil {
		fmt.Println("Test Error:", err)
		os.Exit(1)
	}
	os.Exit(0)
}
