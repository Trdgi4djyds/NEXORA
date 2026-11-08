//go:build !windows

// Hors Windows : équivalents neutres (essais et construction sous Linux). Le lanceur n'est livré que pour Windows.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func installRoot() string {
	if r := os.Getenv("NEXORA_TOOLBOX_ROOT"); r != "" {
		return r
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".local", "share", "nexora-devs-toolbox")
}

func singleInstance() (func(), bool) { return func() {}, true }
func showError(err error)            { fmt.Fprintln(os.Stderr, "Erreur :", err) }
func showWarning(msg string)         { fmt.Fprintln(os.Stderr, "Attention :", msg) }
func showInfo(msg string)            { fmt.Println(msg) }
func showDone(title, msg string)     { fmt.Println(title+" :", msg) }

type consoleProgress struct{ last string }

func newProgress(title string) Progress { fmt.Println(title); return &consoleProgress{} }
func (c *consoleProgress) Set(f float64, msg string) {
	line := fmt.Sprintf("%3.0f %% %s", f*100, msg)
	if f < 0 { // durée inconnue (contrôle au démarrage)
		line = "… " + msg
	}
	if line != c.last {
		fmt.Println(line)
		c.last = line
	}
}
func (c *consoleProgress) Cancelled() bool { return false }
func (c *consoleProgress) Close()          {}

func askUninstall() (UninstallChoice, bool)         { return UninstallChoice{}, true }
func register(Layout, *State, *Manifest) error      { return nil }
func unregister(Layout)                             {}
func scheduleRemoval(root string)                   { os.RemoveAll(root) }
func detach(*exec.Cmd)                              {}
func commandFor(p string, args ...string) *exec.Cmd { return exec.Command(p, args...) }

func userDataDirs() DataDirs {
	home, _ := os.UserHomeDir()
	return dataDirs(filepath.Join(home, "Documents"), filepath.Join(home, ".config"), filepath.Join(home, ".local", "share"))
}

func machineGUID() string {
	b, err := os.ReadFile("/etc/machine-id")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

// Hors Windows (essais) : l'écran de sécurité est écrit dans la console ; securityChoice simule le choix.
var securityChoice = "quit"

func securityScreen(kind, title, msg string, actions []string) string {
	fmt.Fprintf(os.Stderr, "[%s] %s\n%s\n", kind, title, msg)
	return securityChoice
}
