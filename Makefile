PKG_NAME := samba-ad-dc
DIST_DIR  := dist
LOCAL_COCKPIT_DIR := $(HOME)/.local/share/cockpit
PROD_COCKPIT_DIR := /usr/share/cockpit
INSTALL_DIR := $(PROD_COCKPIT_DIR)/$(PKG_NAME)

-include Makefile.local

.PHONY: all clean build watch install uninstall devel-install devel-uninstall check help

all: build

build: ## Build bundle in dist/
	node build.js

watch: ## Watch mode (auto-rebuild)
	node build.js --watch

clean: ## Remove build artifacts
	rm -rf dist node_modules

devel-install: build ## Symlink dist/ into local cockpit directory
	mkdir -p $(LOCAL_COCKPIT_DIR)
	ln -sfn $(PWD)/$(DIST_DIR) $(LOCAL_COCKPIT_DIR)/$(PKG_NAME)

devel-uninstall: ## Remove local cockpit symlink
	rm -f $(LOCAL_COCKPIT_DIR)/$(PKG_NAME)

install: build ## Copy dist/ into local cockpit directory
	install -d $(INSTALL_DIR)
	cp -a $(DIST_DIR)/. $(INSTALL_DIR)/

uninstall: ## Remove installed local cockpit files
	rm -rf $(INSTALL_DIR)

check: ## Run unit tests
	node --experimental-strip-types --test test/*.test.ts

help:
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk -F ':.*?## ' '{printf "  %-18s %s\n", $$1, $$2}'
