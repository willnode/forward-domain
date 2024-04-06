package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/letsencrypt/challtestsrv"
)

func main() {

	challSrv, err := challtestsrv.New(challtestsrv.Config{
		HTTPOneAddrs: []string{":8888"},
	})
	if err != nil {
		panic(err)
	}
	go challSrv.Run()

	// Get the current working directory.
	currentDir, err := os.Getwd()
	if err != nil {
		fmt.Println("Error:", err)
		return
	}

	// Get the parent directory.
	parentDir := filepath.Dir(currentDir)

	cmd := exec.Command("bun", "test", "--timeout", "60000")
	cmd.Dir = parentDir
	cmd.Stderr = os.Stderr
	cmd.Stdout = os.Stdout

	err = cmd.Run()
	if err != nil {
		fmt.Println("Error:", err)
		os.Exit(1)
	}
}
